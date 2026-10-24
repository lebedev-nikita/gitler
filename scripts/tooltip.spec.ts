import { expect, test } from "@playwright/test";
import { demoDetail, demoSnapshot } from "../src/lib/demo";

for (const { width, height } of [
  { width: 1536, height: 1024 },
  { width: 390, height: 844 },
]) {
  for (const previewOpen of [false, true]) {
    test(`file tooltip scrolling stays inside the list (${width}px, preview ${previewOpen})`, async ({
      page,
    }) => {
      const snapshot = { ...demoSnapshot(), commonDir: "/fixture/.git" };
      const baseDetail = demoDetail("", null, null);
      const detail = {
        ...baseDetail,
        files: Array.from({ length: 100 }, (_, index) => ({
          ...baseDetail.files[0],
          path: `src/deeply/nested/directory/with/a/long/path/file-${index}.ts`,
        })),
      };
      await page.addInitScript(
        ({ snapshot, detail }) => {
          Object.assign(window, {
            isTauri: true,
            __TAURI_INTERNALS__: {
              metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
              transformCallback: () => 1,
              invoke: async (command: string) => {
                if (command === "plugin:event|listen") return 1;
                if (command === "launch_path" || command === "open_repository")
                  return snapshot.path;
                if (command === "repository_snapshot") return snapshot;
                if (command === "commit_detail" || command === "worktree_detail") return detail;
                if (command === "file_diff") return { text: "", truncated: false };
                return null;
              },
            },
            __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => undefined },
          });
        },
        { snapshot, detail },
      );
      await page.setViewportSize({ width, height });
      await page.goto("/");
      const files = page.getByLabel("Changed files");
      await expect(files.getByRole("button")).toHaveCount(100);
      if (!previewOpen) {
        await page.getByRole("button", { name: "Hide diff preview", exact: true }).click();
      }
      await files.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await files.getByRole("button").last().hover();
      await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toBeVisible();

      const sizes = await files.evaluate(async (element) => {
        element.scrollTop = 0;
        const samples = [];
        for (let frame = 0; frame < 20; frame++) {
          await new Promise(requestAnimationFrame);
          samples.push({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
          });
        }
        return samples;
      });
      for (const size of sizes) {
        expect(size.width).toBeLessThanOrEqual(size.viewportWidth);
        expect(size.height).toBeLessThanOrEqual(size.viewportHeight);
      }
      await expect(
        page.locator('[data-slot="tooltip-content"][data-open]').filter({ hasText: "file-99.ts" }),
      ).not.toBeVisible();
    });
  }
}

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
