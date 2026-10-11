import { expect, test } from "@playwright/test";
import { demoDetail, demoDiff, demoSnapshot } from "../src/lib/demo";

test("marks merged branches without hiding working changes", async ({ page }) => {
  const demo = demoSnapshot();
  const feature = demo.refs[1];
  const target = demo.refs[0];
  const integrated = {
    ...feature,
    integration: { target: "main" },
  };
  const snapshot = {
    ...demo,
    commits: demo.commits.map((commit) =>
      commit.oid === target.oid ? { ...commit, parents: [...commit.parents, feature.oid] } : commit,
    ),
    refs: demo.refs.map((ref) => (ref === feature ? integrated : ref)),
  };
  const detail = demoDetail("", null, snapshot.worktrees[1].path);
  const diff = demoDiff({
    commonDir: "/fixture/.git",
    path: detail.files[0].path,
    oid: null,
    base: null,
    worktree: snapshot.worktrees[1].path,
    mode: "combined",
    reverse: false,
  });
  await page.addInitScript(
    ({ snapshot, detail, diff }) => {
      const current = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
      };
      current.isTauri = true;
      current.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string) => {
          if (command === "plugin:event|listen") return 1;
          if (command === "plugin:event|unlisten" || command === "fetch_remotes") return null;
          if (command === "launch_path" || command === "open_repository") return snapshot.path;
          if (command === "repository_snapshot") return { ...snapshot, commonDir: "/fixture/.git" };
          if (command === "worktree_detail" || command === "commit_detail") return detail;
          if (command === "file_diff") return diff;
          throw new Error(`Unexpected command ${command}`);
        },
      };
      current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    { snapshot, detail, diff },
  );
  await page.goto("/");
  const branch = page
    .locator("[data-node-id]")
    .filter({ hasText: "Handle renamed files in status parser" });
  await expect(branch).toContainText("Merged into main");
  await expect(branch.locator('[data-integration="ancestry"]')).toHaveAttribute(
    "title",
    /part of main's commit history/i,
  );
  await expect(branch.locator("svg circle").first()).not.toHaveAttribute("cx", "20");
  await expect(
    page.getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true }),
  ).not.toContainText("Merged into main");
  await expect(
    page.getByRole("button", { name: "Improve Git parsing for linked worktrees", exact: true }),
  ).not.toContainText("Merged into main");
  await page.screenshot({ path: ".impeccable/review/integration-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(branch).toContainText("Merged into main");
  await page.screenshot({ path: ".impeccable/review/integration-narrow.png", fullPage: true });
});
