import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import config from "../../src-tauri/tauri.conf.json";

it("matches every native title bar to the application's toolbar background", () => {
  const source = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
  const background = source.match(/<header\b[^>]*className="[^"]*\bbg-([a-z-]+)\b/)?.[1];
  expect(background, "The toolbar must declare a semantic background color").toBeDefined();
  const token = css.match(new RegExp(`--color-${background}:\\s*var\\(--([a-z-]+)\\)`))?.[1];
  expect(token, "The toolbar's background must resolve to a CSS color token").toBeDefined();
  const color = css.match(new RegExp(`--${token}:\\s*(#[0-9a-f]{6})\\s*;`, "i"))?.[1];
  expect(color, "The native window background needs the toolbar's opaque hex color").toBeDefined();
  expect(config.app.windows.length).toBeGreaterThan(0);
  for (const window of config.app.windows) {
    expect(window.titleBarStyle).toBe("Transparent");
    expect(window.theme).toBe("Dark");
    expect(
      window.backgroundColor.toLowerCase(),
      "Update the native background when changing the toolbar palette",
    ).toBe(color!.toLowerCase());
  }
});
