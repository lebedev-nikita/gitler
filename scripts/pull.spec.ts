import { expect, test, type Page } from "@playwright/test";
import { demoSnapshot } from "../src/lib/demo";

async function mockPull(page: Page, fail = false, noWorktree = false) {
  const snapshot = { ...demoSnapshot(), commonDir: "/fixture/.git" };
  if (noWorktree)
    snapshot.worktrees = snapshot.worktrees.filter(
      (tree) => tree.branch !== "feature/worktree-map",
    );
  await page.addInitScript(
    ({ snapshot, fail }) => {
      const current = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
        calls: Array<{ command: string; args: Record<string, unknown> }>;
        releasePull: () => void;
      };
      current.isTauri = true;
      current.calls = [];
      current.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string, args: Record<string, unknown>) => {
          current.calls.push({ command, args });
          if (command === "plugin:event|listen") return 1;
          if (["plugin:event|unlisten", "fetch_remotes"].includes(command)) return null;
          if (["launch_path", "open_repository"].includes(command)) return snapshot.path;
          if (command === "repository_snapshot") return snapshot;
          if (["commit_detail", "worktree_detail"].includes(command))
            return {
              oid: snapshot.commits[0].oid,
              author: "",
              email: "",
              timestamp: 0,
              message: "Changes",
              parents: [],
              files: [],
              base: null,
            };
          if (command === "pull_branch") {
            await new Promise<void>((resolve) => {
              current.releasePull = resolve;
            });
            if (fail)
              throw "Local and upstream histories have diverged. Merge or rebase in Git, then retry Pull.";
            return null;
          }
          throw new Error(`Unexpected command ${command}`);
        },
      };
      current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    { snapshot, fail },
  );
  return snapshot;
}

for (const noWorktree of [false, true]) {
  test(`pulls the selected branch ${noWorktree ? "without a worktree" : "in its worktree"} once and refreshes`, async ({
    page,
  }) => {
    const snapshot = await mockPull(page, false, noWorktree);
    await page.goto("/");
    await page.getByText("feature/worktree-map", { exact: true }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Pull", exact: true })).toBeVisible();
    if (!noWorktree) await page.screenshot({ path: ".impeccable/review/pull-menu.png" });
    await page.getByRole("menuitem", { name: "Pull", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Pulling branch", exact: true });
    await expect(dialog.getByRole("status")).toContainText("Fetching upstream");
    await expect(dialog).toContainText("feature/worktree-map");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button")).toHaveCount(0);
    const calls = await page.evaluate(
      () =>
        (window as unknown as { calls: Array<{ command: string; args: Record<string, unknown> }> })
          .calls,
    );
    expect(calls.filter((call) => call.command === "pull_branch")).toEqual([
      {
        command: "pull_branch",
        args: {
          commonDir: snapshot.commonDir,
          branch: "feature/worktree-map",
          expectedHead: snapshot.refs.find(
            (ref) => ref.kind === "branch" && ref.name === "feature/worktree-map",
          )!.oid,
          expectedWorktree:
            snapshot.worktrees.find((tree) => tree.branch === "feature/worktree-map")?.path ?? null,
        },
      },
    ]);
    await page.evaluate(() => (window as unknown as { releasePull: () => void }).releasePull());
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const calls = (window as unknown as { calls: Array<{ command: string }> }).calls;
          return calls
            .slice(calls.findIndex((call) => call.command === "pull_branch") + 1)
            .some((call) => call.command === "repository_snapshot");
        }),
      )
      .toBe(true);
  });
}

test("shows pull failure and allows closing at the minimum window size", async ({ page }) => {
  await mockPull(page, true);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await page.getByText("feature/worktree-map", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pull", exact: true }).click();
  await page.screenshot({ path: ".impeccable/review/pull-progress.png", animations: "disabled" });
  await page.evaluate(() => (window as unknown as { releasePull: () => void }).releasePull());
  const dialog = page.getByRole("dialog", { name: "Could not pull branch", exact: true });
  await expect(dialog).toContainText("histories have diverged");
  const close = dialog
    .locator("[data-slot=dialog-footer]")
    .getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/pull-error.png" });
  await close.click();
  await expect(dialog).toHaveCount(0);
});
