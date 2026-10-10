import { expect, test } from "@playwright/test";

test("repository graph, working nodes, context-menu comparisons and filters", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("3 branches have uncommitted changes")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Uncommitted changes on/ })).toHaveCount(3);
  await expect(page.getByLabel("Selection details")).toContainText("agent/auth-flow");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  for (const subject of [
    "Add repository-wide worktree discovery",
    "Merge branch 'feature/worktree-map'",
    "Merge branch 'fix/empty-state'",
    "Initial commit",
  ]) {
    await expect(
      page.getByRole("button", { name: subject, exact: true }).locator("svg circle").first(),
    ).toHaveAttribute("cx", "20");
  }
  await expect(
    page
      .getByRole("button", { name: "Handle renamed files in status parser", exact: true })
      .locator("svg circle")
      .first(),
  ).not.toHaveAttribute("cx", "20");
  const patch = page.getByLabel("Diff for src/auth/session.ts");
  expect((await patch.boundingBox())?.height).toBeGreaterThanOrEqual(180);
  await page.screenshot({ path: ".impeccable/review/desktop.png", fullPage: true });

  await page
    .getByRole("button", { name: "Add repository-wide worktree discovery", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Uncommitted changes on agent/git-parser", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Diff with selected" }).click();
  await expect(page.getByLabel("Comparison diff")).toContainText("Compare changes");
  await expect(page.getByLabel("Comparison diff")).toContainText("agent/git-parser · working");
  await expect(page.getByLabel("Diff for src-tauri/src/git.rs")).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/comparison.png", fullPage: true });

  await page.getByRole("button", { name: "Back to selection" }).click();
  await page
    .getByRole("button", { name: "Handle renamed files in status parser", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Diff with selected" }).click();
  await expect(page.getByLabel("Comparison diff")).toContainText("0000002");
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByLabel("Comparison diff")).toHaveCount(0);

  await page.getByRole("button", { name: "Toggle graph filters" }).click();
  await page.getByLabel("Uncommitted only").check();
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByLabel("Filter history by branch").selectOption("refs/heads/main");
  await expect(
    page.getByRole("button", { name: "Handle renamed files in status parser", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Toggle graph filters" }).click();
  await page.getByRole("textbox", { name: "Search loaded commits" }).fill("no-such-commit");
  await expect(page.getByText("No matching commits", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page
    .getByRole("button", { name: "Uncommitted changes on agent/auth-flow", exact: true })
    .click();
  await page.getByRole("button", { name: "Show details panel" }).click();
  await page.getByRole("button", { name: "Staged", exact: true }).click();
  await expect(page.getByLabel("Changed files")).toContainText("src/auth/refresh.ts");
  await expect(page.getByLabel("Changed files")).not.toContainText("tests/auth.test.ts");
  await page.getByRole("button", { name: "All changes", exact: true }).click();
  await page.getByRole("button", { name: "tests/auth.test.ts" }).click();
  await expect(page.getByLabel("Diff for tests/auth.test.ts")).toContainText(
    "new file mode 100644",
  );
  expect(errors).toEqual([]);
});

test("arrow keys navigate filtered graph nodes without changing selection from the diff", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle graph filters" }).click();
  await page.getByLabel("Uncommitted only").check();
  const nodes = page.getByRole("button", { name: /^Uncommitted changes on/ });
  await nodes.first().click();
  await nodes.first().press("ArrowDown");
  await expect(nodes.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(nodes.nth(1)).toBeFocused();
  const diff = page.getByLabel(/^Diff for /);
  await diff.focus();
  await diff.press("ArrowDown");
  await expect(nodes.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(diff).toBeFocused();
  await page.getByLabel("Filter history by branch").focus();
  await page.getByLabel("Filter history by branch").press("ArrowDown");
  await expect(page.getByLabel("Filter history by branch")).toBeFocused();
});

test("narrow layout keeps graph and diff accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Commit graph" })).toBeVisible();
  await expect(page.getByLabel("Selection details")).toBeVisible();
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  expect(
    (await page.getByLabel("Diff for src/auth/session.ts").boundingBox())?.height,
  ).toBeGreaterThanOrEqual(180);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  await page.screenshot({ path: ".impeccable/review/mobile.png", fullPage: true });
});
