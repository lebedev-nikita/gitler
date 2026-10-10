import { useMemo } from "react";
import { FileCode2 } from "lucide-react";
import { parseDiff } from "@/lib/diff";
import type { DiffResult } from "@/lib/models";
import { CopyButton, EmptyMessage } from "./common";

export function DiffView({ diff, file }: { diff: DiffResult; file: string }) {
  const lines = useMemo(() => parseDiff(diff.text), [diff.text]);
  const additions = lines.filter((line) => line.kind === "addition").length;
  const deletions = lines.filter((line) => line.kind === "deletion").length;
  return (
    <div className="diff-view">
      <div className="diff-file-heading">
        <FileCode2 />
        <span title={file}>{file}</span>
        <div className="diff-stat">
          <span className="added">+{additions}</span>
          <span className="removed">−{deletions}</span>
        </div>
        <CopyButton value={diff.text} label="Copy diff" />
      </div>
      {diff.truncated && (
        <p className="diff-truncated" role="status">
          Showing the first 512 KiB of this diff.
        </p>
      )}
      {diff.text.trim() ? (
        <div className="diff-scroll" tabIndex={0} aria-label={`Diff for ${file}`}>
          <div className="diff-lines">
            {lines.map((line, index) => (
              <div className={`diff-line ${line.kind}`} key={index}>
                <span className="line-number">{line.oldLine}</span>
                <span className="line-number">{line.newLine}</span>
                <code>{line.text || " "}</code>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyMessage
          icon={FileCode2}
          title="No differences in this view"
          description="The contents match. For working changes, inspect Staged or Unstaged separately."
        />
      )}
    </div>
  );
}
