import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { demoDetail, demoDiff, demoSnapshot } from "../src/lib/demo";

async function mockRefresh(page: Page) {
  const snapshot = { ...demoSnapshot(), commonDir: "/fixture/.git", hasMore: true };
  const tree = snapshot.worktrees[1];
  const detail = demoDetail("", null, tree.path);
  const diff = demoDiff({
    commonDir: "demo",
    path: tree.files[0].path,
    oid: null,
    base: null,
    worktree: tree.path,
    mode: "combined",
    reverse: false,
  });
  await page.addInitScript(
    ({ snapshot, detail, diff }) => {
      const current = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
        refresh: {
          held: boolean;
          calls: string[];
          pending: Record<string, () => void>;
          diffText: string;
          fail: string | null;
        };
      };
      current.isTauri = true;
      current.refresh = { held: false, calls: [], pending: {}, diffText: diff.text, fail: null };
      current.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string) => {
          if (command === "plugin:event|listen") return 1;
          if (command === "plugin:event|unlisten") return null;
          if (command === "launch_path" || command === "open_repository") return snapshot.path;
          if (command === "fetch_remotes") return null;
          current.refresh.calls.push(command);
          if (current.refresh.held)
            await new Promise<void>((resolve) => {
              current.refresh.pending[command] = resolve;
            });
          if (current.refresh.fail === command) throw new Error("Background scan failed");
          if (command === "repository_snapshot")
            return { ...snapshot, scannedAt: ++snapshot.scannedAt };
          if (command === "worktree_detail" || command === "commit_detail") return detail;
          if (command === "file_diff") return { ...diff, text: current.refresh.diffText };
          throw new Error(`Unexpected command ${command}`);
        },
      };
      current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    { snapshot, detail, diff },
  );
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await expect(page.getByLabel("Refresh repository")).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { refresh: { held: boolean } }).refresh.held = true;
  });
}

async function pending(page: Page, command: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (command) =>
          !!(window as unknown as { refresh: { pending: Record<string, unknown> } }).refresh
            .pending[command],
        command,
      ),
    )
    .toBe(true);
}

async function release(page: Page, command: string) {
  await page.evaluate((command) => {
    const refresh = (window as unknown as { refresh: { pending: Record<string, () => void> } })
      .refresh;
    refresh.pending[command]();
    delete refresh.pending[command];
  }, command);
}

test("automatic scans keep refresh and history controls quiet", async ({ page }) => {
  await mockRefresh(page);
  await page.clock.fastForward(15000);
  await pending(page, "repository_snapshot");
  await expect(page.getByLabel("Refresh repository").locator(".animate-spin")).toHaveCount(0);
  await expect(page.getByLabel("Refresh repository")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Load older commits" })).toBeEnabled();
  await expect(page.locator("footer")).not.toContainText("Refreshing repository");
});

test("automatic scans preserve loaded files and diff while revalidating", async ({ page }) => {
  await mockRefresh(page);
  const diff = page.getByLabel("Diff for src/auth/session.ts");
  const original = await diff.textContent();
  await page.clock.fastForward(15000);
  await pending(page, "repository_snapshot");
  await release(page, "repository_snapshot");
  await pending(page, "worktree_detail");
  await expect(page.getByLabel("Changed files")).toBeVisible();
  await expect(diff).toHaveText(original!);
  await expect(page.getByText("Reading changed files…")).toHaveCount(0);
  await release(page, "worktree_detail");
  await pending(page, "file_diff");
  await expect(diff).toHaveText(original!);
  await expect(page.getByText("Reading diff…")).toHaveCount(0);
  await release(page, "file_diff");
  await expect(diff).toHaveText(original!);
});

test("automatic scans update diff content even when file statuses are unchanged", async ({
  page,
}) => {
  await mockRefresh(page);
  await page.evaluate(() => {
    (window as unknown as { refresh: { diffText: string } }).refresh.diffText =
      "@@ -1 +1 @@\n-before\n+updated by background scan\n";
  });
  await page.clock.fastForward(15000);
  await pending(page, "repository_snapshot");
  await release(page, "repository_snapshot");
  await pending(page, "worktree_detail");
  await release(page, "worktree_detail");
  await pending(page, "file_diff");
  await release(page, "file_diff");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toContainText(
    "updated by background scan",
  );
});

for (const trigger of ["button", "shortcut"] as const) {
  test(`manual refresh via ${trigger} shows progress`, async ({ page }) => {
    await mockRefresh(page);
    if (trigger === "button") await page.getByLabel("Refresh repository").click();
    else await page.keyboard.press("Control+r");
    await pending(page, "repository_snapshot");
    await expect(page.getByLabel("Refresh repository").locator(".animate-spin")).toHaveCount(1);
    await expect(page.locator("footer")).toContainText("Refreshing repository…");
    await release(page, "repository_snapshot");
    await expect(page.getByLabel("Refresh repository").locator(".animate-spin")).toHaveCount(0);
  });
}

test("manual refresh joins an automatic scan without starting another request", async ({
  page,
}) => {
  await mockRefresh(page);
  await page.clock.fastForward(15000);
  await pending(page, "repository_snapshot");
  const count = await page.evaluate(
    () =>
      (window as unknown as { refresh: { calls: string[] } }).refresh.calls.filter(
        (command) => command === "repository_snapshot",
      ).length,
  );
  await page.getByLabel("Refresh repository").click();
  await expect(page.getByLabel("Refresh repository").locator(".animate-spin")).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { refresh: { calls: string[] } }).refresh.calls.filter(
          (command) => command === "repository_snapshot",
        ).length,
    ),
  ).toBe(count);
  await release(page, "repository_snapshot");
  await expect(page.getByLabel("Refresh repository").locator(".animate-spin")).toHaveCount(0);
});

for (const target of ["file", "mode"] as const) {
  test(`switching ${target} does not show a previous diff as the new selection`, async ({
    page,
  }) => {
    await mockRefresh(page);
    if (target === "file") await page.getByRole("button", { name: "tests/auth.test.ts" }).click();
    else await page.getByRole("button", { name: "Unstaged", exact: true }).click();
    await pending(page, "file_diff");
    await expect(page.getByText("Reading diff…")).toBeVisible();
    await expect(page.getByLabel("Diff for src/auth/session.ts")).toHaveCount(0);
    await release(page, "file_diff");
    await expect(
      page.getByLabel(
        `Diff for ${target === "file" ? "tests/auth.test.ts" : "src/auth/session.ts"}`,
      ),
    ).toBeVisible();
  });
}

test("failed automatic scans keep the graph and diff and report the error", async ({ page }) => {
  await mockRefresh(page);
  await page.evaluate(() => {
    (window as unknown as { refresh: { fail: string | null } }).refresh.fail =
      "repository_snapshot";
  });
  await page.clock.fastForward(15000);
  await pending(page, "repository_snapshot");
  await release(page, "repository_snapshot");
  await expect(page.locator("footer")).toContainText(
    "Refresh failed — showing the last available scan",
  );
  await expect(page.getByRole("heading", { name: "Commit graph" })).toBeVisible();
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await expect(page.getByLabel("Refresh repository").locator(".animate-spin")).toHaveCount(0);
});
