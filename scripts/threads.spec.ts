import { expect, test, type Page } from "@playwright/test";
import { demoSnapshot } from "../src/lib/demo";

async function mockT3(
  page: Page,
  options: {
    missing?: boolean;
    worktree?: string;
    fail?: boolean;
    hold?: "prepare" | "start";
    openError?: string;
    prepareError?: boolean;
    holdRefresh?: boolean;
  } = {},
) {
  const snapshot = { ...demoSnapshot(), commonDir: "/fixture/.git" };
  await page.addInitScript(
    ({ snapshot, options }) => {
      const current = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
        calls: Array<{ command: string; args: Record<string, unknown> }>;
        releaseThread: () => void;
      };
      current.isTauri = true;
      current.calls = [];
      current.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string, args: Record<string, unknown>) => {
          current.calls.push({ command, args });
          if (command === "plugin:event|listen") return 1;
          if (["plugin:event|unlisten", "fetch_remotes", "open_t3_instructions"].includes(command))
            return null;
          if (["launch_path", "open_repository"].includes(command)) return snapshot.path;
          if (command === "repository_snapshot") {
            if (
              options.holdRefresh &&
              current.calls.some((call) => call.command === "start_t3_thread")
            )
              return new Promise(() => undefined);
            return snapshot;
          }
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
          if (command === "prepare_t3_thread") {
            if (options.hold === "prepare")
              await new Promise<void>((resolve) => {
                current.releaseThread = resolve;
              });
            if (options.prepareError) throw "The selected branch no longer exists.";
            return {
              available: !options.missing,
              head: options.missing
                ? null
                : snapshot.refs.find((ref) => ref.kind === "branch" && ref.name === args.branch)!
                    .oid,
              worktree: options.worktree ?? null,
              message: options.missing ? "Open T3 Code before starting a thread." : null,
            };
          }
          if (command === "start_t3_thread") {
            if (options.hold === "start")
              await new Promise<void>((resolve) => {
                current.releaseThread = resolve;
              });
            if (options.fail) throw "The T3 Code request failed. Thread ID: fixture-thread.";
            return {
              reference: "fixture:thread-id",
              worktree: options.worktree ?? "/fixture/new-worktree",
              openError: options.openError ?? null,
            };
          }
          throw new Error(`Unexpected command ${command}`);
        },
      };
      current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    { snapshot, options },
  );
}

async function openThread(page: Page) {
  await page.goto("/");
  await page.getByText("feature/worktree-map", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Create T3 Code thread", exact: true }).click();
}

async function releaseThread(page: Page) {
  await page.evaluate(() => (window as unknown as { releaseThread: () => void }).releaseThread());
}

for (const worktree of [undefined, "/fixture/existing-worktree"]) {
  test(`immediately creates a thread ${worktree ? "in an existing worktree" : "with a new worktree"} and closes on success`, async ({
    page,
  }) => {
    await mockT3(page, { worktree, hold: "start", holdRefresh: true });
    if (worktree) await page.setViewportSize({ width: 900, height: 600 });
    await openThread(page);
    const dialog = page.getByRole("dialog", { name: "Creating T3 Code thread", exact: true });
    await expect(dialog.getByRole("status")).toHaveText("Creating thread…");
    await expect(dialog).toContainText("feature/worktree-map");
    await expect(dialog.getByRole("button")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.mouse.click(10, 10);
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: `.impeccable/review/thread-progress-${worktree ? "minimum" : "desktop"}.png`,
      animations: "disabled",
    });
    await releaseThread(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Thread created", { exact: true })).toHaveCount(0);
    const calls = await page.evaluate(
      () => (window as unknown as { calls: Array<{ command: string; args: unknown }> }).calls,
    );
    expect(calls.filter((call) => call.command === "prepare_t3_thread")).toHaveLength(1);
    expect(calls.filter((call) => call.command === "start_t3_thread")).toHaveLength(1);
    expect(calls.find((call) => call.command === "start_t3_thread")?.args).toEqual({
      commonDir: "/fixture/.git",
      branch: "feature/worktree-map",
      expectedHead: demoSnapshot().refs.find((ref) => ref.name === "feature/worktree-map")!.oid,
      expectedWorktree: worktree ?? null,
    });
  });
}

test("shows a spinner while connecting without asking for confirmation", async ({ page }) => {
  await mockT3(page, { hold: "prepare" });
  await openThread(page);
  const dialog = page.getByRole("dialog", { name: "Creating T3 Code thread", exact: true });
  await expect(dialog.getByRole("status")).toHaveText("Connecting to T3 Code…");
  await expect(dialog.getByRole("button")).toHaveCount(0);
  await releaseThread(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("unavailable T3 Code shows a dialog with its GitHub link at minimum window size", async ({
  page,
}) => {
  await mockT3(page, { missing: true });
  await page.setViewportSize({ width: 900, height: 600 });
  await openThread(page);
  const dialog = page.getByRole("dialog", { name: "T3 Code unavailable" });
  await expect(dialog).toContainText("No additional CLI is needed");
  const github = dialog.getByRole("button", { name: "T3 Code on GitHub" });
  await expect(github).toBeInViewport();
  await page.screenshot({ path: ".impeccable/review/thread-minimum.png", animations: "disabled" });
  await github.click();
  const calls = await page.evaluate(
    () => (window as unknown as { calls: Array<{ command: string }> }).calls,
  );
  expect(calls.some((call) => call.command === "open_t3_instructions")).toBe(true);
  expect(calls.some((call) => call.command === "start_t3_thread")).toBe(false);
});

test("uncertain creation preserves the thread ID and offers no duplicate submission", async ({
  page,
}) => {
  await mockT3(page, { fail: true });
  await openThread(page);
  const dialog = page.getByRole("dialog", { name: "Could not create thread", exact: true });
  await expect(dialog).toContainText("fixture-thread");
  await expect(dialog).toContainText("Check T3 Code before trying again");
  await expect(dialog.getByRole("button", { name: "Create thread", exact: true })).toHaveCount(0);
  await dialog
    .locator("[data-slot=dialog-footer]")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const count = await page.evaluate(
    () =>
      (window as unknown as { calls: Array<{ command: string }> }).calls.filter(
        (call) => call.command === "start_t3_thread",
      ).length,
  );
  expect(count).toBe(1);
});

test("preparation errors do not start creation", async ({ page }) => {
  await mockT3(page, { prepareError: true });
  await openThread(page);
  const dialog = page.getByRole("dialog", { name: "Could not create thread", exact: true });
  await expect(dialog).toContainText("The selected branch no longer exists.");
  await expect(dialog).not.toContainText("a thread may already have been created");
  const calls = await page.evaluate(
    () => (window as unknown as { calls: Array<{ command: string }> }).calls,
  );
  expect(calls.some((call) => call.command === "start_t3_thread")).toBe(false);
});

test("a failed app handoff keeps the created thread reference visible", async ({ page }) => {
  await mockT3(page, { openError: "Thread created. Open T3 Code to continue." });
  await openThread(page);
  const dialog = page.getByRole("dialog", { name: "Could not open T3 Code", exact: true });
  await expect(dialog).toContainText("fixture:thread-id");
  await expect(dialog).toContainText("Open T3 Code manually");
  await expect(dialog.getByRole("button", { name: "Create thread", exact: true })).toHaveCount(0);
});
