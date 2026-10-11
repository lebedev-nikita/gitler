import { expect, test } from "@playwright/test";
import { demoSnapshot } from "../src/lib/demo";

test("opening another repository or the current worktree preserves this window's selection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((snapshot) => {
    const callbacks = new Map<number, (event: unknown) => void>();
    let callbackId = 0;
    let finishScan!: () => void;
    const scan = new Promise<void>((resolve) => {
      finishScan = resolve;
    });
    const current = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: unknown;
      __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
      repositoryRequests: string[];
      finishScan: () => void;
      emitRepositoryOpen: (path: string) => void;
    };
    current.isTauri = true;
    current.finishScan = finishScan;
    current.repositoryRequests = [];
    localStorage.setItem("gitler.repository", "/saved-other/.git");
    current.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "repository-1" },
        currentWebview: { label: "repository-1" },
      },
      transformCallback: (callback: (event: unknown) => void) => {
        callbacks.set(++callbackId, callback);
        return callbackId;
      },
      invoke: async (command: string, args: Record<string, unknown>) => {
        if (command === "plugin:event|listen") {
          current.emitRepositoryOpen = (path: string) => {
            callbacks.get(args.handler as number)?.({ payload: path });
          };
          return args.handler;
        }
        if (command === "plugin:event|unlisten") return;
        if (command === "launch_path") return "/current/.git";
        if (command === "open_repository") {
          const path = args.path as string;
          current.repositoryRequests.push(path);
          if (path === "/invalid") throw "Not a Git repository";
          return path === "/other" ? null : "/current/.git";
        }
        if (command === "fetch_remotes") return null;
        if (command === "repository_snapshot") {
          await scan;
          return snapshot;
        }
        throw new Error(`Unexpected IPC command: ${command}`);
      },
    };
    current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
  }, demoSnapshot());
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Reading repository history…");
  await expect(
    page.getByRole("heading", { name: "Every branch. Nothing left behind." }),
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("initial-scan.png") });
  await page.evaluate(() => (window as unknown as { finishScan: () => void }).finishScan());
  const selected = page.getByRole("button", {
    name: "Handle renamed files in status parser",
    exact: true,
  });
  await selected.click();
  await expect(selected).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Open repository", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Each repository opens in its own window");
  await dialog.getByLabel("Repository path").fill("/other");
  await dialog.getByRole("button", { name: "Open repository", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(selected).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Open repository", exact: true }).first().click();
  await dialog.getByLabel("Repository path").fill("/current-worktree");
  await dialog.getByRole("button", { name: "Open repository", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(selected).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Open repository", exact: true }).first().click();
  await dialog.getByLabel("Repository path").fill("/invalid");
  await dialog.getByRole("button", { name: "Open repository", exact: true }).click();
  await expect(dialog).toContainText("Not a Git repository");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(selected).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() => {
    (window as unknown as { emitRepositoryOpen: (path: string) => void }).emitRepositoryOpen(
      "/current-worktree",
    );
  });
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  const requests = await page.evaluate(
    () => (window as unknown as { repositoryRequests: string[] }).repositoryRequests,
  );
  expect(requests).toEqual([
    "/current/.git",
    "/other",
    "/current-worktree",
    "/invalid",
    "/current-worktree",
  ]);
  expect(errors).toEqual([]);
});
