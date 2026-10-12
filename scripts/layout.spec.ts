import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function dragBoundary(page: Page, handle: Locator, x: number, y: number) {
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  const start = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + x, start.y + y, { steps: 8 });
  await page.mouse.up();
}

async function dimension(locator: Locator, axis: "width" | "height") {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds![axis];
}

test("details can be hidden and reopened without reopening on graph selection", async ({
  page,
}) => {
  await page.goto("/");
  const inspector = page.getByLabel("Selection details");
  await expect(inspector).toBeVisible();
  await expect(page.locator("footer button")).toHaveCount(0);
  await expect(page.getByText(/Auto-refresh/)).toHaveCount(0);
  const graph = page.getByRole("region", { name: "Commit graph" });
  const original = await dimension(graph, "width");
  await page.getByRole("button", { name: "Hide details panel" }).click();
  await expect(inspector).toHaveCount(0);
  expect(await dimension(graph, "width")).toBeGreaterThan(original + 300);
  const commit = page.getByRole("button", {
    name: "Handle renamed files in status parser",
    exact: true,
  });
  await commit.click();
  await expect(inspector).toHaveCount(0);
  await expect(commit).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Show details panel" }).click();
  await expect(inspector).toContainText("Handle renamed files in status parser");
  await page.getByRole("button", { name: "Close details" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Commit graph" })).toBeVisible();
  await expect(inspector).toHaveCount(0);
  await page.getByRole("button", { name: "Show details panel" }).click();
  await expect(inspector).toBeVisible();
  await page.getByRole("button", { name: "tests/auth.test.ts" }).click();
  await expect(page.getByLabel("Diff for tests/auth.test.ts")).toBeVisible();
  await page.getByRole("button", { name: "Hide details panel" }).click();
  await page.getByRole("button", { name: "Show details panel" }).click();
  await expect(page.getByLabel("Diff for tests/auth.test.ts")).toBeVisible();
  await page.getByRole("button", { name: "Staged", exact: true }).click();
  await expect(page.getByRole("button", { name: "src/auth/refresh.ts" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Hide details panel" }).click();
  await page.getByRole("button", { name: "Show details panel" }).click();
  await expect(page.getByRole("button", { name: "Staged", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Diff for src/auth/refresh.ts")).toBeVisible();
});

test("diff preview can be hidden independently and stays hidden across selections", async ({
  page,
}) => {
  await page.goto("/");
  const files = page.getByLabel("Changed files");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/close-preview-desktop.png", fullPage: true });
  const original = await dimension(files, "height");
  await page.getByRole("button", { name: "Close diff preview" }).click();
  await expect(page.getByLabel("Diff preview", { exact: true })).toHaveCount(0);
  await expect(files).toBeVisible();
  expect(await dimension(files, "height")).toBeGreaterThan(original + 100);
  await page.getByRole("button", { name: "tests/auth.test.ts" }).click();
  await expect(page.getByLabel("Diff preview", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show diff preview" }).click();
  await expect(page.getByLabel("Diff for tests/auth.test.ts")).toBeVisible();
  await page.getByRole("button", { name: "Close diff preview" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Uncommitted changes on agent/git-parser", exact: true })
    .click();
  await expect(page.getByLabel("Selection details")).toContainText("agent/git-parser");
  await expect(page.getByRole("button", { name: "Show diff preview" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Show diff preview" })).toBeVisible();
  await expect(page.getByLabel("Diff preview", { exact: true })).toHaveCount(0);
});

test("graph and details resize by dragging and keyboard and restore after hiding or reload", async ({
  page,
}) => {
  await page.goto("/");
  const inspector = page.getByLabel("Selection details");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  const handle = page.getByRole("separator", { name: "Resize graph and details panels" });
  await expect(handle).toHaveAttribute("aria-orientation", "vertical");
  const original = await dimension(inspector, "width");
  await dragBoundary(page, handle, -150, 0);
  await expect.poll(() => dimension(inspector, "width")).toBeGreaterThan(original + 140);
  await handle.focus();
  await handle.press("ArrowLeft");
  const resized = await dimension(inspector, "width");
  expect(resized).toBeGreaterThan(original + 150);
  await page.getByRole("button", { name: "Hide details panel" }).click();
  await page.getByRole("button", { name: "Show details panel" }).click();
  await expect.poll(() => dimension(inspector, "width")).toBeCloseTo(resized, 0);
  await page.reload();
  await expect(inspector).toBeVisible();
  await expect.poll(() => dimension(inspector, "width")).toBeCloseTo(resized, 0);
  await dragBoundary(page, handle, -2000, 0);
  expect(
    await dimension(page.getByRole("region", { name: "Commit graph" }), "width"),
  ).toBeGreaterThanOrEqual(279);
  await dragBoundary(page, handle, 2000, 0);
  expect(await dimension(inspector, "width")).toBeGreaterThanOrEqual(319);
});

test("file list and diff preview resize independently and keep their layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  const files = page.getByLabel("Changed files");
  const diff = page.getByLabel("Diff preview", { exact: true });
  const originalFiles = await dimension(files, "height");
  const originalDiff = await dimension(diff, "height");
  const handle = page.getByRole("separator", { name: "Resize file list and diff preview" });
  await dragBoundary(page, handle, 0, 100);
  await expect.poll(() => dimension(files, "height")).toBeGreaterThan(originalFiles + 90);
  expect(await dimension(diff, "height")).toBeLessThan(originalDiff - 90);
  const resized = await dimension(files, "height");
  await page.getByRole("button", { name: "Hide diff preview" }).click();
  await page.getByRole("button", { name: "Show diff preview" }).click();
  await expect.poll(() => dimension(files, "height")).toBeCloseTo(resized, 0);
  await page.reload();
  await expect(files).toBeVisible();
  await expect.poll(() => dimension(files, "height")).toBeCloseTo(resized, 0);
});

test("narrow windows resize stacked panels and preserve the selected file across breakpoints", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/close-preview-narrow.png", fullPage: true });
  const graph = page.getByRole("region", { name: "Commit graph" });
  const handle = page.getByRole("separator", { name: "Resize graph and details panels" });
  await expect(handle).toHaveAttribute("aria-orientation", "horizontal");
  const original = await dimension(graph, "height");
  await dragBoundary(page, handle, 0, 40);
  await expect.poll(() => dimension(graph, "height")).toBeGreaterThan(original + 30);
  await page.getByRole("button", { name: "tests/auth.test.ts" }).click();
  await expect(page.getByLabel("Diff for tests/auth.test.ts")).toBeVisible();
  await page.setViewportSize({ width: 1536, height: 1024 });
  await expect(handle).toHaveAttribute("aria-orientation", "vertical");
  await expect(page.getByLabel("Diff for tests/auth.test.ts")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).toHaveAttribute("aria-orientation", "horizontal");
  await expect(page.getByLabel("Diff for tests/auth.test.ts")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight);
});

test("explicit comparisons reopen a hidden diff preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hide diff preview" }).click();
  await page.getByRole("button", { name: "Hide details panel" }).click();
  await page
    .getByRole("button", { name: "Add repository-wide worktree discovery", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Diff with selected" }).click();
  await expect(page.getByLabel("Comparison diff")).toBeVisible();
  await expect(page.getByLabel("Diff preview", { exact: true })).toBeVisible();
});

test("panel controls still work when local storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage disabled");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage disabled");
    };
  });
  await page.goto("/");
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await page.getByRole("button", { name: "Hide diff preview" }).click();
  await page.getByRole("button", { name: "Show diff preview" }).click();
  await expect(page.getByLabel("Diff for src/auth/session.ts")).toBeVisible();
  await dragBoundary(
    page,
    page.getByRole("separator", { name: "Resize graph and details panels" }),
    -50,
    0,
  );
  await expect(page.getByRole("heading", { name: "Commit graph" })).toBeVisible();
});
