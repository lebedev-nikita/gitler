import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { browserDev } from "../../scripts/browser-dev";
import type { DiscardPlan, Snapshot } from "./models";

describe.runIf(process.platform === "darwin" && process.arch === "arm64")(
  "browser Git transport",
  () => {
    let directory: string;
    let repository: string;
    let linked: string;
    let server: ViteDevServer;
    let base: string;
    let token: string;
    let commonDir: string;

    function git(...args: string[]) {
      return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
    }

    async function invoke(command: string, args: Record<string, unknown>) {
      return fetch(`${base}/__gitler/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gitler-Session": token },
        body: JSON.stringify({ command, args }),
      });
    }

    async function call(command: string, args: Record<string, unknown>) {
      const response = await invoke(command, args);
      const payload = await response.json();
      expect(response.status, JSON.stringify(payload)).toBe(200);
      return payload.result;
    }

    beforeAll(async () => {
      directory = await realpath(await mkdtemp(join(tmpdir(), "gitler-browser-test-")));
      repository = join(directory, "repo 'quotes' $(literal)");
      linked = join(directory, "linked");
      await mkdir(repository);
      git("init", "-b", "main");
      git("config", "user.name", "Browser tests");
      git("config", "user.email", "browser@example.test");
      await writeFile(join(repository, "note.txt"), "original\n");
      git("add", ".");
      git("commit", "-m", "Real browser fixture commit");
      git("worktree", "add", "-b", "agent/browser", linked);
      await writeFile(join(repository, "note.txt"), "working edit\n");
      vi.stubEnv("GITLER_BROWSER", "1");
      vi.stubEnv("GITLER_BROWSER_REPOSITORY", repository);
      server = await createServer({
        configFile: false,
        plugins: [browserDev()],
        server: { host: "127.0.0.1", port: 0 },
      });
      await server.listen();
      base = server.resolvedUrls!.local[0].replace(/\/$/, "");
      const html = await (await fetch(base)).text();
      const connection = JSON.parse(html.match(/window\.__GITLER_BROWSER__ = (.+);/)![1]);
      expect(connection.path).toBe(repository);
      token = connection.token;
      commonDir = git("rev-parse", "--path-format=absolute", "--git-common-dir");
    }, 120000);

    afterAll(async () => {
      await server?.close();
      vi.unstubAllEnvs();
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    it("loads real history and linked worktrees without changing the index", async () => {
      const index = await readFile(join(commonDir, "index"));
      expect(await call("open_repository", { path: linked })).toBe(linked);
      const history: Snapshot = await call("repository_snapshot", {
        path: linked,
        limit: 400,
        includeWorktreeStatus: false,
      });
      expect(history.worktreeStatusPending).toBe(true);
      expect(history.worktrees.every((tree) => tree.files.length === 0)).toBe(true);
      expect(history.commits[0].subject).toBe("Real browser fixture commit");
      expect(await readFile(join(commonDir, "index"))).toEqual(index);
      const snapshot: Snapshot = await call("repository_snapshot", { path: linked, limit: 400 });
      expect(snapshot.worktreeStatusPending).toBe(false);
      expect(snapshot.worktrees.find((tree) => tree.path === repository)?.files).toHaveLength(1);
      expect(snapshot.commonDir).toBe(commonDir);
      expect(snapshot.commits[0].subject).toBe("Real browser fixture commit");
      expect(snapshot.worktrees.map((tree) => tree.path)).toEqual(
        expect.arrayContaining([repository, linked]),
      );
      const detail = await call("worktree_detail", { commonDir, worktree: repository, base: null });
      expect(detail.files.map((file: { path: string }) => file.path)).toContain("note.txt");
      const diff = await call("file_diff", {
        request: {
          commonDir,
          worktree: repository,
          oid: null,
          base: null,
          path: "note.txt",
          mode: "combined",
          reverse: false,
        },
      });
      expect(diff.text).toContain("+working edit");
      expect(await readFile(join(commonDir, "index"))).toEqual(index);
    });

    it("rejects unauthenticated and cross-origin requests", async () => {
      expect((await fetch(`${base}/__gitler/invoke`, { method: "POST" })).status).toBe(403);
      expect(
        (
          await fetch(`${base}/__gitler/invoke`, {
            method: "POST",
            headers: { "X-Gitler-Session": token, Origin: "https://example.test" },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${base}/__gitler/invoke`, {
            headers: { "X-Gitler-Session": token },
          })
        ).status,
      ).toBe(405);
    });

    it("serves media bytes from a linked worktree through the browser transport", async () => {
      const file = join(linked, "preview.svg");
      const contents = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
      const index = await readFile(join(commonDir, "index"));
      await writeFile(file, contents);
      try {
        const media = await call("file_media", {
          request: {
            commonDir,
            worktree: linked,
            oid: null,
            base: null,
            path: "preview.svg",
            mode: "untracked",
            reverse: false,
          },
        });
        expect(media.before).toBeNull();
        expect(media.after).toEqual({
          mime: "image/svg+xml",
          dataUrl: `data:image/svg+xml;base64,${Buffer.from(contents).toString("base64")}`,
          size: Buffer.byteLength(contents),
          error: null,
        });
        expect(await readFile(join(commonDir, "index"))).toEqual(index);
        expect(await readFile(file, "utf8")).toBe(contents);
      } finally {
        await rm(file);
      }
    });

    it("preserves stale-preview checks before discarding selected files", async () => {
      const preview: DiscardPlan = await call("prepare_discard", {
        commonDir,
        worktree: repository,
      });
      await writeFile(join(repository, "note.txt"), "edit after preview\n");
      const args = {
        commonDir,
        worktree: repository,
        expectedHead: preview.head,
        files: preview.files.map((file) => ({ path: file.path, token: file.token })),
      };
      expect((await invoke("discard_changes", args)).status).toBe(400);
      expect(await readFile(join(repository, "note.txt"), "utf8")).toBe("edit after preview\n");
      const fresh: DiscardPlan = await call("prepare_discard", { commonDir, worktree: repository });
      expect(
        await call("discard_changes", {
          ...args,
          expectedHead: fresh.head,
          files: fresh.files.map((file) => ({ path: file.path, token: file.token })),
        }),
      ).toBeNull();
      expect(await readFile(join(repository, "note.txt"), "utf8")).toBe("original\n");
    });

    it("keeps main protected and rejects unsupported Git operations", async () => {
      expect((await invoke("prepare_delete_branch", { commonDir, branch: "main" })).status).toBe(
        400,
      );
      const [snapshot, unsupported] = await Promise.all([
        call("repository_snapshot", { path: repository, limit: 400 }),
        invoke("checkout", { branch: "agent/browser" }),
      ]);
      expect(unsupported.status).toBe(400);
      expect(snapshot.commonDir).toBe(commonDir);
      expect(git("branch", "--show-current")).toBe("main");
    });
  },
);
