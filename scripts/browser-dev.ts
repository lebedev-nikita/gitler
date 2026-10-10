import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import type { Plugin } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeDirectory = resolve(root, "src-tauri");
const RequestSchema = Schema.Struct({
  command: Schema.String,
  args: Schema.Record(Schema.String, Schema.Unknown),
});
const ReplySchema = Schema.Struct({
  id: Schema.Number,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
});
type Request = typeof RequestSchema.Type;

class BridgeError extends Schema.TaggedError<BridgeError>()("BridgeError", {
  message: Schema.String,
}) {}

const failure = (error: unknown) => new BridgeError({ message: String(error) });

function buildNative(): Promise<void> {
  return new Promise((accept, reject) => {
    const build = spawn(
      "cargo",
      [
        "build",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--features",
        "browser-dev",
        "--bin",
        "gitler-browser",
      ],
      { cwd: root, stdio: "inherit" },
    );
    build.once("error", reject);
    build.once("exit", (code) => {
      if (code === 0) accept();
      else reject(new Error(`Browser backend build failed (${code})`));
    });
  });
}

class NativeBridge {
  private sequence = 0;
  private pending = new Map<number, { accept(value: unknown): void; reject(error: Error): void }>();
  private process: ChildProcessWithoutNullStreams;

  constructor() {
    const targetDirectory = process.env.CARGO_TARGET_DIR
      ? resolve(root, process.env.CARGO_TARGET_DIR)
      : resolve(nativeDirectory, "target");
    this.process = spawn(resolve(targetDirectory, "debug/gitler-browser"), [], { cwd: root });
    this.process.stderr.pipe(process.stderr, { end: false });
    this.process.stdin.on("error", (error) => this.fail(error));
    const lines = createInterface({ input: this.process.stdout });
    lines.on("line", (line) => {
      try {
        const reply = Schema.decodeUnknownSync(ReplySchema)(JSON.parse(line));
        const pending = this.pending.get(reply.id);
        this.pending.delete(reply.id);
        if (reply.error !== undefined) pending?.reject(new Error(reply.error));
        else pending?.accept(reply.result);
      } catch (error) {
        this.fail(new Error(`Invalid browser backend response: ${error}`));
      }
    });
    this.process.once("error", (error) => this.fail(error));
    this.process.once("exit", () => {
      lines.close();
      this.fail(new Error("Browser backend stopped. Restart just dev."));
    });
  }

  call(request: Request): Promise<unknown> {
    return new Promise((accept, reject) => {
      if (this.process.exitCode !== null || this.process.killed) {
        reject(new Error("Browser backend is unavailable. Restart just dev."));
        return;
      }
      const id = ++this.sequence;
      this.pending.set(id, { accept, reject });
      this.process.stdin.write(JSON.stringify({ id, ...request }) + "\n", (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private fail(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  close() {
    this.fail(new Error("Browser backend restarted or closed."));
    this.process.stdin.end();
    this.process.kill();
  }
}

class BrowserBridge extends Context.Service<
  BrowserBridge,
  {
    call(request: Request): Effect.Effect<unknown, BridgeError>;
    rebuild: Effect.Effect<void, BridgeError>;
  }
>()("gitler/BrowserBridge") {
  static readonly layer = Layer.effect(
    BrowserBridge,
    Effect.gen(function* () {
      yield* Effect.tryPromise({ try: buildNative, catch: failure });
      const resource = yield* Effect.acquireRelease(
        Effect.sync(() => ({ current: new NativeBridge() })),
        (resource) => Effect.sync(() => resource.current.close()),
      );
      const call = Effect.fn("BrowserBridge.call")((request: Request) =>
        Effect.tryPromise({ try: () => resource.current.call(request), catch: failure }),
      );
      const rebuild = Effect.tryPromise({
        try: async () => {
          await buildNative();
          resource.current.close();
          resource.current = new NativeBridge();
        },
        catch: failure,
      });
      return BrowserBridge.of({ call, rebuild });
    }),
  );
}

export function browserDev(): Plugin | null {
  if (process.env.GITLER_BROWSER !== "1") return null;
  const token = randomBytes(32).toString("hex");
  let repository = "";
  const runtime = ManagedRuntime.make(BrowserBridge.layer);
  let rebuild = Promise.resolve();
  return {
    name: "gitler-browser-dev",
    apply: "serve",
    config: () => ({
      server: { host: "127.0.0.1", watch: { ignored: ["**/src-tauri/target/**"] } },
    }),
    async configureServer(server) {
      repository = await realpath(resolve(root, process.env.GITLER_BROWSER_REPOSITORY ?? "."));
      // Compile before listening or opening the browser.
      await runtime.runPromise(BrowserBridge.use(() => Effect.void));
      const onChange = (path: string) => {
        if (
          !path.startsWith(nativeDirectory + "/") ||
          (!path.endsWith(".rs") && !path.endsWith("Cargo.toml"))
        )
          return;
        rebuild = rebuild.then(async () => {
          try {
            await runtime.runPromise(BrowserBridge.use((bridge) => bridge.rebuild));
            server.ws.send({ type: "full-reload" });
          } catch (error) {
            server.config.logger.error(String(error));
          }
        });
      };
      server.watcher.add([resolve(nativeDirectory, "src"), resolve(nativeDirectory, "Cargo.toml")]);
      server.watcher.on("change", onChange);
      server.httpServer?.once("close", () => {
        server.watcher.off("change", onChange);
        void rebuild.finally(() => runtime.dispose());
      });
      server.middlewares.use("/__gitler/invoke", async (request, response) => {
        const origin = `http://${request.headers.host}`;
        const host = request.headers.host?.split(":")[0];
        if (
          host !== "127.0.0.1" ||
          (request.headers.origin !== undefined && request.headers.origin !== origin) ||
          request.headers["x-gitler-session"] !== token
        ) {
          response.writeHead(403).end();
          return;
        }
        if (
          request.method !== "POST" ||
          !request.headers["content-type"]?.startsWith("application/json")
        ) {
          response.writeHead(405).end();
          return;
        }
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        try {
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of request) {
            length += chunk.length;
            if (length > 1024 * 1024) throw new Error("Request is too large");
            chunks.push(chunk);
          }
          const parsed = Schema.decodeUnknownSync(RequestSchema)(
            JSON.parse(Buffer.concat(chunks).toString()),
          );
          const result = await runtime.runPromise(
            BrowserBridge.use((bridge) => bridge.call(parsed)),
          );
          response.end(JSON.stringify({ result }));
        } catch (error) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: String(error) }));
        }
      });
    },
    async closeBundle() {
      await rebuild;
      await runtime.dispose();
    },
    transformIndexHtml() {
      const connection = JSON.stringify({ token, path: repository }).replaceAll("<", "\\u003c");
      return [
        {
          tag: "script",
          children: `window.__GITLER_BROWSER__ = ${connection};`,
          injectTo: "head-prepend",
        },
      ];
    },
  };
}
