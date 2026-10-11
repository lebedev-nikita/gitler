import { expect, test } from "@playwright/test";

test("tooltips open after 500 ms and support keyboard focus and Escape", async ({ page }) => {
  await page.goto("/");
  const open = page.getByRole("button", { name: "Open repository", exact: true });
  await expect(open).toBeVisible();
  await expect(page.locator("[title]")).toHaveCount(0);
  await page.clock.install();

  await open.hover();
  await page.clock.runFor(450);
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveCount(0);
  await page.clock.runFor(50);
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveText(
    "Open repository (⌘ / Ctrl O)",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveCount(0);

  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await open.focus();
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveText(
    "Open repository (⌘ / Ctrl O)",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveCount(0);
});

test("file tooltips describe existing controls without changing their actions", async ({
  page,
}) => {
  await page.goto("/");
  const file = page.getByLabel("Changed files").getByRole("button", {
    name: /tests\/auth.test.ts/,
  });
  await file.hover();
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveText(
    "tests/auth.test.ts · Untracked",
  );
  await file.click();
  await expect(page.getByLabel("Diff for tests/auth.test.ts")).toBeVisible();

  await page.getByRole("button", { name: "Keyboard shortcuts", exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveText(
    "Keyboard shortcuts (?)",
  );
  await page.locator('[data-slot="tooltip-content"][data-open]').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({ path: "test-results/tooltip-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Keyboard shortcuts", exact: true }).hover();
  const tooltip = page.locator('[data-slot="tooltip-content"][data-open]');
  await expect(tooltip).toBeVisible();
  await tooltip.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const bounds = await tooltip.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/tooltip-mobile.png" });
});
