import { expect, test } from "@playwright/test";
import { demoSnapshot } from "../src/lib/demo";

async function mockDesktop(
  page: import("@playwright/test").Page,
  fail = false,
  slow = false,
  deleteFailure = false,
) {
  const snapshot = { ...demoSnapshot(), commonDir: "/fixture/.git" };
  snapshot.refs = snapshot.refs.map((ref) => ({
    ...ref,
    mergedInto: ["feature/worktree-map", "agent/cleanup"].includes(ref.name) ? "main" : null,
  }));
  await page.addInitScript(
    ({ snapshot, fail, slow, deleteFailure }) => {
      const current = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
        calls: Array<{ command: string; args: Record<string, unknown> }>;
      };
      current.isTauri = true;
      current.calls = [];
      current.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string, args: Record<string, unknown>) => {
          current.calls.push({ command, args });
          if (command === "plugin:event|listen") return 1;
          if (command === "plugin:event|unlisten") return null;
          if (command === "launch_path" || command === "open_repository") return snapshot.path;
          if (command === "fetch_remotes") return null;
          if (command === "repository_snapshot") return snapshot;
          if (command === "worktree_detail" || command === "commit_detail")
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
          if (command === "generate_branch_name") {
            if (slow) await new Promise((resolve) => setTimeout(resolve, 2000));
            if (fail) throw "Codex login is required";
            return { branchName: "agent/improve-auth-refresh", head: snapshot.worktrees[1].head };
          }
          if (command === "prepare_delete_branch") {
            const ref = snapshot.refs.find((ref) => ref.name === args.branch)!;
            return {
              head: ref.oid,
              mergedInto: "main",
              baseHead: snapshot.refs[0].oid,
              worktrees: snapshot.worktrees
                .filter((tree) => tree.branch === args.branch)
                .map((tree) => tree.path),
            };
          }
          if (command === "delete_branch") {
            if (deleteFailure)
              throw "The branch or its worktrees changed. Reopen the delete dialog to review them.";
            snapshot.worktrees = snapshot.worktrees.filter((tree) => tree.branch !== args.branch);
            snapshot.refs = snapshot.refs.filter(
              (ref) => ref.kind !== "branch" || ref.name !== args.branch,
            );
            return null;
          }
          if (command === "prepare_discard") {
            const tree = snapshot.worktrees.find((tree) => tree.path === args.worktree)!;
            return {
              head: tree.head,
              files: tree.files.map((file) => ({
                ...file,
                token: `token:${file.path}`,
                unavailable: null,
              })),
            };
          }
          if (command === "rename_branch") {
            snapshot.worktrees = snapshot.worktrees.map((tree) =>
              tree.branch === args.branch ? { ...tree, branch: args.newName as string } : tree,
            );
            snapshot.refs = snapshot.refs.map((ref) =>
              ref.kind === "branch" && ref.name === args.branch
                ? {
                    ...ref,
                    name: args.newName as string,
                    fullName: `refs/heads/${args.newName as string}`,
                  }
                : ref,
            );
            return null;
          }
          if (command === "discard_changes") {
            const files = args.files as Array<{ path: string }>;
            snapshot.worktrees = snapshot.worktrees.map((tree) =>
              tree.path === args.worktree
                ? {
                    ...tree,
                    files: tree.files.filter(
                      (file) => !files.some((selected) => selected.path === file.path),
                    ),
                  }
                : tree,
            );
            return null;
          }
          if (command === "cancel_codegen") return null;
          throw new Error(`Unexpected command ${command}`);
        },
      };
      current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    { snapshot, fail, slow, deleteFailure },
  );
}

test("Codex rename is generated from the right-clicked branch and applied after review", async ({
  page,
}) => {
  await mockDesktop(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true })
    .click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Discard uncommitted changes…" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Regenerate branch name with Codex…" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename branch with Codex" });
  await expect(dialog.getByLabel("New branch name")).toHaveValue("agent/improve-auth-refresh");
  await dialog.getByLabel("New branch name").fill("fix/auth-token-refresh");
  await page.screenshot({
    path: ".impeccable/review/rename.png",
    fullPage: true,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Rename branch", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Uncommitted changes on fix/auth-token-refresh",
      exact: true,
    }),
  ).toBeVisible();
  const call = await page.evaluate(() =>
    (window as unknown as { calls: Array<{ command: string; args: unknown }> }).calls.find(
      (call) => call.command === "rename_branch",
    ),
  );
  expect(call?.args).toMatchObject({
    branch: "agent/auth-flow",
    newName: "fix/auth-token-refresh",
    commonDir: "/fixture/.git",
  });
});

test("discard from a branch label selects only that branch's working files", async ({ page }) => {
  await mockDesktop(page);
  await page.goto("/");
  const row = page.getByRole("button", {
    name: "Improve Git parsing for linked worktrees",
    exact: true,
  });
  await row.getByText("agent/git-parser", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Discard uncommitted changes…" }).click();
  const dialog = page.getByRole("dialog", { name: "Discard uncommitted changes" });
  await expect(dialog.getByRole("button", { name: "Discard 2 files", exact: true })).toBeEnabled();
  await dialog.getByRole("checkbox", { name: "tests/status-parser.rs", exact: true }).uncheck();
  await page.screenshot({
    path: ".impeccable/review/discard.png",
    fullPage: true,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Discard 1 file", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const call = await page.evaluate(() =>
    (window as unknown as { calls: Array<{ command: string; args: unknown }> }).calls.find(
      (call) => call.command === "discard_changes",
    ),
  );
  expect(call?.args).toMatchObject({
    worktree: "/Users/alex/Projects/gitler-worktrees/git-parser",
    files: [{ path: "src-tauri/src/git.rs", token: "token:src-tauri/src/git.rs" }],
  });
  await expect(
    page.getByRole("button", { name: "Uncommitted changes on agent/git-parser", exact: true }),
  ).toContainText("1 files");
});

test("Codex errors allow retry and cancel does not rename the branch", async ({ page }) => {
  await mockDesktop(page, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Regenerate branch name with Codex…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Codex login is required");
  await expect(dialog.getByRole("button", { name: "Rename branch", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Generate name", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const calls = await page.evaluate(
    () => (window as unknown as { calls: Array<{ command: string }> }).calls,
  );
  expect(calls.some((call) => call.command === "rename_branch")).toBe(false);
});

test("closing a pending generation cancels its Codex process", async ({ page }) => {
  await mockDesktop(page, false, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Regenerate branch name with Codex…" }).click();
  await page.getByRole("button", { name: "Cancel generation", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { calls: Array<{ command: string }> }).calls.some(
          (call) => call.command === "cancel_codegen",
        ),
      ),
    )
    .toBe(true);
});

test("discard dialog fits the minimum desktop window and requires a file selection", async ({
  page,
}) => {
  await mockDesktop(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Discard uncommitted changes…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Select all available files", exact: true }).uncheck();
  await expect(dialog.getByRole("button", { name: "Discard 0 files", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "src/auth/session.ts", exact: true }).check();
  await expect(
    dialog.getByRole("button", { name: "Discard 1 file", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: ".impeccable/review/discard-minimum.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("merged branch deletion reviews the worktree, applies the preview and refreshes the graph", async ({
  page,
}) => {
  await mockDesktop(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle graph filters" }).click();
  await page.getByLabel("Filter history by branch").selectOption("refs/heads/feature/worktree-map");
  await page
    .getByRole("button", { name: "Add worktree map to the interface", exact: true })
    .getByText("feature/worktree-map", { exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete branch and worktree…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete merged branch" });
  await expect(dialog).toContainText("feature/worktree-map");
  await expect(dialog).toContainText("Merged into main");
  await expect(dialog.getByRole("list", { name: "Worktrees to delete" })).toContainText(
    "/Users/alex/Projects/gitler-worktrees/worktree-map",
  );
  const remove = dialog.getByRole("button", { name: "Delete branch and worktree", exact: true });
  await expect(remove).toBeEnabled();
  await expect(remove).toBeInViewport();
  await page.screenshot({
    path: ".impeccable/review/delete-branch.png",
    fullPage: true,
    animations: "disabled",
  });
  await remove.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-local-branch="feature/worktree-map"]')).toHaveCount(0);
  await expect(page.getByLabel("Filter history by branch")).toHaveValue("all");
  const call = await page.evaluate(() =>
    (window as unknown as { calls: Array<{ command: string; args: unknown }> }).calls.find(
      (call) => call.command === "delete_branch",
    ),
  );
  expect(call?.args).toMatchObject({
    commonDir: "/fixture/.git",
    branch: "feature/worktree-map",
    expected: {
      head: demoSnapshot().worktrees[3].head,
      baseHead: demoSnapshot().refs[0].oid,
      mergedInto: "main",
      worktrees: ["/Users/alex/Projects/gitler-worktrees/worktree-map"],
    },
  });
});

test("deletion is hidden for unmerged and main branches and disabled for dirty worktrees", async ({
  page,
}) => {
  await mockDesktop(page);
  await page.goto("/");
  for (const branch of ["agent/auth-flow", "main"]) {
    await page.locator(`[data-local-branch="${branch}"]`).first().click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: /^Delete / })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("button", { name: "Uncommitted changes on agent/cleanup", exact: true })
    .click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Delete branch and worktree…", exact: true }),
  ).toBeDisabled();
});

test("cancel keeps a merged branch and stale confirmation errors keep the dialog open", async ({
  page,
}) => {
  await mockDesktop(page, false, false, true);
  await page.goto("/");
  const branch = page.locator('[data-local-branch="feature/worktree-map"]');
  await branch.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete branch and worktree…", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { calls: Array<{ command: string }> }).calls.some(
        (call) => call.command === "delete_branch",
      ),
    ),
  ).toBe(false);
  await branch.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete branch and worktree…", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete branch and worktree", exact: true }).click();
  await expect(dialog).toContainText("Reopen the delete dialog");
  await expect(
    dialog.getByRole("button", { name: "Delete branch and worktree", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(branch).toBeVisible();
});
