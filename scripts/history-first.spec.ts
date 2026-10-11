import { expect, test, type Page } from "@playwright/test";
import { demoDetail, demoDiff, demoSnapshot } from "../src/lib/demo";

async function mockOpening(page: Page) {
  const demo = demoSnapshot();
  const snapshot = {
    ...demo,
    commonDir: "/fixture/.git",
    remotes: [],
    refs: demo.refs.map((ref) =>
      ref.name === "feature/worktree-map" ? { ...ref, mergedInto: "main" } : ref,
    ),
  };
  const detail = demoDetail(snapshot.commits[0].oid, null, null);
  const diff = demoDiff({
    commonDir: snapshot.commonDir,
    path: detail.files[0].path,
    oid: detail.oid,
    base: null,
    worktree: null,
    mode: "commit",
    reverse: false,
  });
  await page.addInitScript(
    ({ snapshot, detail, diff }) => {
      let release!: () => void;
      const statuses = new Promise<void>((resolve) => {
        release = resolve;
      });
      const current = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
        opening: { release: () => void; fail: boolean; calls: boolean[] };
      };
      current.isTauri = true;
      current.opening = { release, fail: false, calls: [] };
      current.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string, args: Record<string, unknown>) => {
          if (command === "plugin:event|listen") return 1;
          if (command === "plugin:event|unlisten") return;
          if (command === "launch_path" || command === "open_repository") return snapshot.path;
          if (command === "repository_snapshot") {
            const includeStatus = args.includeWorktreeStatus !== false;
            current.opening.calls.push(includeStatus);
            if (!includeStatus)
              return {
                ...snapshot,
                worktreeStatusPending: true,
                worktrees: snapshot.worktrees.map((tree) => ({ ...tree, files: [] })),
              };
            await statuses;
            if (current.opening.fail) throw "Working copy scan failed";
            return snapshot;
          }
          if (command === "commit_detail" || command === "worktree_detail") return detail;
          if (command === "file_diff") return diff;
          throw new Error(`Unexpected command ${command}`);
        },
      };
      current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    { snapshot, detail, diff },
  );
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Commit graph" })).toBeVisible();
  await expect(page.locator("footer").getByRole("status")).toHaveText("Checking working copies…");
}

test("opens history before working copies and preserves selection as statuses arrive", async ({
  page,
}) => {
  await mockOpening(page);
  expect(
    await page.evaluate(
      () => (window as unknown as { opening: { calls: boolean[] } }).opening.calls,
    ),
  ).toEqual([false, true]);
  await expect(page.getByRole("button", { name: /Uncommitted changes on/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle graph filters" }).click();
  await expect(page.getByLabel("Uncommitted only")).toBeDisabled();
  await page.getByRole("button", { name: "Toggle graph filters" }).click();
  const selected = page.getByRole("button", {
    name: "Handle renamed files in status parser",
    exact: true,
  });
  await selected.click();
  const merged = page.getByRole("button", {
    name: "Add worktree map to the interface",
    exact: true,
  });
  await merged.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Delete branch and worktree…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.locator("header").getByRole("button", { name: demoSnapshot().name, exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Copy repository path")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("history-first-desktop.png") });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: test.info().outputPath("history-first-narrow.png") });
  await page.evaluate(() =>
    (window as unknown as { opening: { release: () => void } }).opening.release(),
  );
  await expect(page.locator("footer").getByRole("status")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true }),
  ).toBeVisible();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Toggle graph filters" }).click();
  await expect(page.getByLabel("Uncommitted only")).toBeEnabled();
});

test("keeps history available when the initial working copy scan fails and allows retry", async ({
  page,
}) => {
  await mockOpening(page);
  await page.evaluate(() => {
    const opening = (window as unknown as { opening: { release: () => void; fail: boolean } })
      .opening;
    opening.fail = true;
    opening.release();
  });
  await expect(page.locator("footer")).toContainText(
    "Could not check working copies — retry Refresh",
    { timeout: 15000 },
  );
  await expect(page.getByRole("region", { name: "Commit graph" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Uncommitted changes on/ })).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { opening: { fail: boolean } }).opening.fail = false;
  });
  await page.getByRole("button", { name: "Refresh repository" }).click();
  await expect(
    page.getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true }),
  ).toBeVisible();
  await expect(page.locator("footer")).not.toContainText("Could not check working copies");
});
