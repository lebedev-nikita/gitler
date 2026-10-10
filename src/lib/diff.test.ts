import { describe, expect, it } from "vitest";
import { parseDiff } from "./diff";

describe("unified diff", () => {
  it("numbers old and new lines independently through multiple hunks", () => {
    const lines = parseDiff(
      "--- a/file\n+++ b/file\n@@ -4,2 +4,3 @@\n context\n-old\n+new\n+added\n@@ -20 +21 @@\n-last\n+last\n\\ No newline at end of file",
    );
    expect(lines[3]).toMatchObject({ oldLine: 4, newLine: 4, kind: "context" });
    expect(lines[4]).toMatchObject({ oldLine: 5, newLine: null, kind: "deletion" });
    expect(lines[5]).toMatchObject({ oldLine: null, newLine: 5, kind: "addition" });
    expect(lines[8]).toMatchObject({ oldLine: 20, kind: "deletion" });
    expect(lines[9]).toMatchObject({ newLine: 21, kind: "addition" });
    expect(lines[10].kind).toBe("meta");
  });

  it("resets numbering for each file and keeps file headers out of change counts", () => {
    const lines = parseDiff(
      "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/b b/b\n--- a/b\n+++ b/b\n@@ -0,0 +1 @@\n+c",
    );
    expect(lines.filter((line) => line.kind === "addition")).toHaveLength(2);
    expect(lines[10]).toMatchObject({ kind: "addition", newLine: 1 });
  });
});
