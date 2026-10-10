import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { demoDetail, demoDiff, demoSnapshot, oid } from "../src/lib/demo";

async function mockRemotes(page: Page, configured = true) {
  const snapshot = { ...demoSnapshot(), commonDir: "/fixture/.git" };
  snapshot.remotes = configured
    ? [
        {
          name: "upstream",
          url: "ssh://git@gitlab.com/group/repo.git",
          webUrl: "https://gitlab.com/group/repo",
        },
        {
          name: "origin",
          url: "git@github.com:owner/repo.git",
          webUrl: "https://github.com/owner/repo",
        },
        { name: "local", url: "/tmp/repo", webUrl: null },
      ]
    : [];
  const detail = demoDetail("", null, snapshot.worktrees[1].path);
  const diff = demoDiff({
    commonDir: "demo",
    path: detail.files[0].path,
    oid: null,
    base: null,
    worktree: snapshot.worktrees[1].path,
    mode: "combined",
    reverse: false,
  });
  await page.addInitScript(
    ({ snapshot, detail, diff, newOid }) => {
      const current = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
        remoteFixture: {
          fetches: number;
          fail: boolean;
          opens: string[];
          hold: boolean;
          release: (() => void) | null;
        };
      };
      current.isTauri = true;
      current.remoteFixture = { fetches: 0, fail: false, opens: [], hold: false, release: null };
      current.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string, args: Record<string, unknown>) => {
          if (command === "plugin:event|listen") return 1;
          if (command === "plugin:event|unlisten") return null;
          if (command === "launch_path" || command === "open_repository") return snapshot.path;
          if (command === "repository_snapshot")
            return { ...snapshot, scannedAt: ++snapshot.scannedAt };
          if (command === "worktree_detail" || command === "commit_detail") return detail;
          if (command === "file_diff") return diff;
          if (command === "open_remote") {
            current.remoteFixture.opens.push(String(args.name));
            return null;
          }
          if (command === "fetch_remotes") {
            current.remoteFixture.fetches++;
            if (current.remoteFixture.hold)
              await new Promise<void>((resolve) => {
                current.remoteFixture.release = resolve;
              });
            if (current.remoteFixture.fail) throw "Network unavailable";
            if (
              current.remoteFixture.fetches > 1 &&
              !snapshot.commits.some((commit) => commit.oid === newOid)
            )
              snapshot.commits = [
                {
                  ...snapshot.commits[0],
                  oid: newOid,
                  parents: [snapshot.commits[0].oid],
                  subject: "New commit from remote",
                },
                ...snapshot.commits,
              ];
            return null;
          }
          throw new Error(`Unexpected command ${command}`);
        },
      };
      current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    { snapshot, detail, diff, newOid: oid(99) },
  );
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
}

test("opens origin directly and every supported remote from repository information", async ({
  page,
}) => {
  await mockRemotes(page);
  await page.getByLabel("Open origin repository in browser").click();
  await page.getByRole("button", { name: "gitler", exact: true }).click();
  await expect(page.getByLabel("Open local repository in browser")).toHaveCount(0);
  await page.getByLabel("Open upstream repository in browser").click();
  expect(
    await page.evaluate(
      () => (window as unknown as { remoteFixture: { opens: string[] } }).remoteFixture.opens,
    ),
  ).toEqual(["origin", "upstream"]);
});

test("background fetch adds remote history without interrupting selection or starting overlapping fetches", async ({
  page,
}) => {
  await mockRemotes(page);
  await expect(page.locator("footer")).toContainText("Remotes updated");
  await page.evaluate(() => {
    (window as unknown as { remoteFixture: { hold: boolean } }).remoteFixture.hold = true;
  });
  await page.clock.fastForward(60000);
  await expect(page.locator("footer")).toContainText("Updating remotes");
  await page.clock.fastForward(60000);
  expect(
    await page.evaluate(
      () => (window as unknown as { remoteFixture: { fetches: number } }).remoteFixture.fetches,
    ),
  ).toBe(2);
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await expect(page.getByLabel("Refresh repository").locator(".animate-spin")).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { remoteFixture: { release: () => void } }).remoteFixture.release();
  });
  await expect(page.getByText("New commit from remote", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
});

test("failed fetch preserves history and can be retried", async ({ page }) => {
  await mockRemotes(page);
  await expect(page.locator("footer")).toContainText("Remotes updated");
  await page.evaluate(() => {
    (window as unknown as { remoteFixture: { fail: boolean } }).remoteFixture.fail = true;
  });
  await page.clock.fastForward(60000);
  await expect(page.getByRole("button", { name: "Remote update failed" })).toBeVisible();
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await page.getByRole("button", { name: "Remote update failed" }).click();
  await expect(page.getByText("Network unavailable", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { remoteFixture: { fail: boolean } }).remoteFixture.fail = false;
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Network unavailable", { exact: true })).toHaveCount(0);
  await expect(page.locator("footer")).toContainText("Remotes updated");
});

test("repositories without remotes keep inspection available without fetching", async ({
  page,
}) => {
  await mockRemotes(page, false);
  await page.clock.fastForward(60000);
  expect(
    await page.evaluate(
      () => (window as unknown as { remoteFixture: { fetches: number } }).remoteFixture.fetches,
    ),
  ).toBe(0);
  await expect(page.getByRole("heading", { name: "Commit graph" })).toBeVisible();
  await expect(page.getByLabel("Open origin repository in browser")).toHaveCount(0);
});
