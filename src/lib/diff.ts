export type DiffLine = {
  text: string;
  kind: "addition" | "deletion" | "hunk" | "meta" | "context";
  oldLine: number | null;
  newLine: number | null;
};

export function parseDiff(text: string): DiffLine[] {
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  return text.split("\n").map((line) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      return { text: line, kind: "hunk", oldLine: null, newLine: null };
    }
    if (
      line.startsWith("diff --git ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("index ") ||
      !inHunk
    ) {
      if (line.startsWith("diff --git ")) inHunk = false;
      return { text: line, kind: "meta", oldLine: null, newLine: null };
    }
    if (line.startsWith("+"))
      return { text: line, kind: "addition", oldLine: null, newLine: newLine++ };
    if (line.startsWith("-"))
      return { text: line, kind: "deletion", oldLine: oldLine++, newLine: null };
    if (line.startsWith(" "))
      return { text: line, kind: "context", oldLine: oldLine++, newLine: newLine++ };
    return { text: line, kind: "meta", oldLine: null, newLine: null };
  });
}
