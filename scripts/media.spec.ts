import { expect, test } from "@playwright/test";
import { demoDetail, demoSnapshot } from "../src/lib/demo";

const videoBase64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAH1EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEyTbuMU6uEHFO7a1OsggHf7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDJXQYxMYXZmNjMuMS4xMDJEiYhAj0AAAAAAABZUrmvXrgEAAAAAAABO14EBc8WIm3F5YEF43V2cgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4Q7msoA4JCwgSC6gSCagQJVsIRVuYEBVe6BAOwBAAAAAAAAAgAAElTDZ/pzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAyc3PVY8CLY8WIm3F5YEF43V1nyKBFo4dFTkNPREVSRIeTTGF2YzYzLjEuMTAyIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDEuMDAwMDAwMDAwAB9DtnWp54EAo6SBAACAMAIAnQEqIAAgAABHCIWFiJmEiAICAAeQ88nA/v+rUIAcU7trkbuPs4EAt4r3gQHxggGx8IED";

function version(mime: string, bytes: Buffer) {
  return {
    mime,
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    size: bytes.length,
    error: null,
  };
}

function wave() {
  const data = Buffer.alloc(44 + 800);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(8000, 28);
  data.writeUInt16LE(1, 32);
  data.writeUInt16LE(8, 34);
  data.write("data", 36);
  data.writeUInt32LE(800, 40);
  data.fill(128, 44);
  return data;
}

test("previews media versions, playback, errors and narrow layouts while preserving text diffs", async ({
  page,
}) => {
  const snapshot = { ...demoSnapshot(), commonDir: "/fixture/.git" };
  const detail = demoDetail("", null, snapshot.worktrees[1].path);
  const files = ["image.svg", "clip.webm", "sound.wav", "broken.png", "large.mp4", "notes.txt"].map(
    (path) => ({
      path,
      oldPath: null,
      indexStatus: "M",
      worktreeStatus: "M",
      additions: null,
      deletions: null,
    }),
  );
  const before = version(
    "image/svg+xml",
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#536779"/></svg>',
    ),
  );
  const after = version(
    "image/svg+xml",
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#339b8c"/></svg>',
    ),
  );
  const media = {
    "image.svg": { before, after },
    "clip.webm": { before: null, after: version("video/webm", Buffer.from(videoBase64, "base64")) },
    "sound.wav": { before: null, after: version("audio/wav", wave()) },
    "broken.png": { before: null, after: version("image/png", Buffer.from("damaged")) },
    "large.mp4": {
      before: null,
      after: {
        mime: "video/mp4",
        dataUrl: null,
        size: null,
        error: "File exceeds the 16 MiB inspection limit",
      },
    },
  };
  await page.addInitScript(
    ({ snapshot, detail, files, media }) => {
      const current = window as unknown as {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
      };
      current.isTauri = true;
      current.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback: () => 1,
        invoke: async (command: string, args: { request?: { path: string; mode: string } }) => {
          if (command === "plugin:event|listen") return 1;
          if (command === "plugin:event|unlisten" || command === "fetch_remotes") return null;
          if (command === "launch_path" || command === "open_repository") return snapshot.path;
          if (command === "repository_snapshot")
            return { ...snapshot, scannedAt: Math.floor(Date.now() / 1000) };
          if (command === "worktree_detail" || command === "commit_detail")
            return { ...detail, files };
          if (command === "file_media") {
            const request = args.request!;
            const result = media[request.path as keyof typeof media];
            if (!result) throw new Error("Unexpected media file");
            if (request.mode === "staged" && request.path === "image.svg")
              return { before: result.before, after: result.before };
            return result;
          }
          if (command === "file_diff") return { text: "@@ -1 +1 @@\n-old\n+new", truncated: false };
          throw new Error(`Unexpected command ${command}`);
        },
      };
      current.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
    },
    { snapshot, detail, files, media },
  );
  await page.goto("/");
  const beforeImage = page.getByRole("img", { name: "Before: image.svg", exact: true });
  const afterImage = page.getByRole("img", { name: "After: image.svg", exact: true });
  await expect(beforeImage).toBeVisible();
  await expect(afterImage).toBeVisible();
  await expect
    .poll(() => afterImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(320);
  await expect(page.getByLabel("After media")).toContainText("320 × 180");
  await page.screenshot({ path: ".impeccable/review/media-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Staged", exact: true }).click();
  await expect(afterImage).toHaveAttribute("src", before.dataUrl);
  await page.getByRole("button", { name: "All changes", exact: true }).click();
  await expect(afterImage).toHaveAttribute("src", after.dataUrl);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(afterImage).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/media-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.getByRole("button", { name: /clip.webm/ }).click();
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((video) => (video as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await expect(video).toHaveAttribute("controls", "");
  await video.evaluate(async (video) => {
    await (video as HTMLVideoElement).play();
  });
  await expect
    .poll(() => video.evaluate((video) => (video as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  // A quiet repository scan must keep the same media element and source.
  await video.evaluate((video) => {
    video.dataset.retained = "yes";
  });
  await page.clock.install();
  await page.clock.fastForward(16000);
  await expect(video).toHaveAttribute("data-retained", "yes");
  await page.getByRole("button", { name: /sound.wav/ }).click();
  const audio = page.locator("audio");
  await expect(audio).toBeVisible();
  await expect
    .poll(() => audio.evaluate((audio) => (audio as HTMLAudioElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await audio.evaluate(async (audio) => {
    await (audio as HTMLAudioElement).play();
  });
  await page.getByRole("button", { name: /broken.png/ }).click();
  await expect(page.getByText("Preview unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText(/format or codec/)).toBeVisible();
  await page.getByRole("button", { name: /large.mp4/ }).click();
  await expect(page.getByText(/16 MiB inspection limit/)).toBeVisible();
  await page.getByRole("button", { name: /notes.txt/ }).click();
  await expect(page.getByLabel("Diff for notes.txt")).toContainText("+new");
});
