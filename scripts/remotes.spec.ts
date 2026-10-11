import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Snapshot } from "../src/lib/models";
import { demoDetail, demoDiff, demoSnapshot, oid } from "../src/lib/demo";

async function mockRemotes(page: Page, configured: boolean | Snapshot["remotes"] = true) {
  const snapshot = { ...demoSnapshot(), commonDir: "/fixture/.git" };
  snapshot.remotes = Array.isArray(configured)
    ? configured
    : configured
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
          if (command === "launch_path" || command === "open_repository")
            return snapshot.worktrees[1].path;
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
  return snapshot;
}

test("repository name links directly to GitHub and remotes remain reachable from update status", async ({
  page,
}) => {
  await mockRemotes(page);
  const link = page.getByRole("link", { name: "Open gitler on GitHub" });
  await expect(link).toHaveAttribute("href", "https://github.com/owner/repo");
  await page.screenshot({ path: test.info().outputPath("repository-header-desktop.png") });
  await link.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator("footer")
    .getByRole("button", { name: /Remotes updated/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Remotes");
  await expect(page.getByText(/Repository-wide information/)).toHaveCount(0);
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
  await page.setViewportSize({ width: 900, height: 600 });
  await mockRemotes(page);
  await expect(page.locator("footer")).toContainText("Remotes updated");
  await page.evaluate(() => {
    (window as unknown as { remoteFixture: { fail: boolean } }).remoteFixture.fail = true;
  });
  await page.clock.fastForward(60000);
  await expect(page.getByRole("button", { name: "Remote update failed" })).toBeVisible();
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await page.getByRole("button", { name: "Remote update failed" }).click();
  await page.clock.runFor(200);
  await expect(page.getByText("Network unavailable", { exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Try again" })).toBeInViewport();
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
  await expect(page.locator("header").getByRole("link")).toHaveCount(0);
  await expect(page.getByLabel("Copy repository path")).toBeVisible();
});

test("copies the base repository folder when opened from a linked worktree", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const snapshot = await mockRemotes(page);
  await page.getByLabel("Copy repository path", { exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(snapshot.path);
  await expect(
    page.locator("header").getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  const open = page.locator("header").getByRole("button", { name: "Open repository", exact: true });
  expect((await open.boundingBox())?.width).toBeLessThan(32);
  await open.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Open repository", exact: true }),
  ).toBeVisible();
});

test("links to other Git hosts and keeps the repository actions visible in a narrow window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockRemotes(page, [
    {
      name: "origin",
      url: "git@gitlab.com:group/repo.git",
      webUrl: "https://gitlab.com/group/repo",
    },
  ]);
  const link = page.getByRole("link", { name: "Open gitler on Remote" });
  await expect(link).toHaveAttribute("href", "https://gitlab.com/group/repo");
  await expect(link).toBeInViewport();
  await expect(page.getByLabel("Copy repository path", { exact: true })).toBeInViewport();
  await expect(
    page.locator("header").getByLabel("Open repository", { exact: true }),
  ).toBeInViewport();
  await link.click();
  expect(
    await page.evaluate(
      () => (window as unknown as { remoteFixture: { opens: string[] } }).remoteFixture.opens,
    ),
  ).toEqual(["origin"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath("repository-header-narrow.png") });
});

test("prefers a GitHub remote when origin points to a different host", async ({ page }) => {
  await mockRemotes(page, [
    {
      name: "origin",
      url: "git@gitlab.com:group/repo.git",
      webUrl: "https://gitlab.com/group/repo",
    },
    {
      name: "upstream",
      url: "git@github.com:owner/repo.git",
      webUrl: "https://github.com/owner/repo",
    },
  ]);
  await expect(page.getByRole("link", { name: "Open gitler on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/owner/repo",
  );
});

test("local remotes expose their address for copying without a broken browser link", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockRemotes(page, [{ name: "origin", url: "/tmp/local-repository", webUrl: null }]);
  await expect(page.locator("header").getByRole("link")).toHaveCount(0);
  await page.getByLabel("Copy origin remote URL").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("/tmp/local-repository");
});
