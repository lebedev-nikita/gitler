import { useMemo } from "react";
import { FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDiff } from "@/lib/diff";
import type { DiffResult } from "@/lib/models";
import { CopyButton, EmptyMessage } from "./common";

export function DiffView({ diff, file }: { diff: DiffResult; file: string }) {
  const lines = useMemo(() => parseDiff(diff.text), [diff.text]);
  const additions = lines.filter((line) => line.kind === "addition").length;
  const deletions = lines.filter((line) => line.kind === "deletion").length;
  return (
    <div className="flex-1 min-h-0 flex flex-col border-t border-border">
      <div className="flex gap-[8px] items-center py-0 px-[15px] h-[39px] flex-none bg-secondary">
        <FileCode2 className="size-[14px] text-muted-foreground flex-none" />
        <span className="flex-1 truncate font-mono text-[10px]" title={file}>
          {file}
        </span>
        <div className="flex gap-[8px] font-mono text-[10px]">
          <span className="text-added">+{additions}</span>
          <span className="text-removed">−{deletions}</span>
        </div>
        <CopyButton value={diff.text} label="Copy diff" />
      </div>
      {diff.truncated && (
        <p
          className="bg-diff-truncated text-dirty m-0 py-[7px] px-[14px] text-[11px]"
          role="status"
        >
          Showing the first 512 KiB of this diff.
        </p>
      )}
      {diff.text.trim() ? (
        <div
          className="flex-1 overflow-auto min-h-0 bg-diff [scrollbar-gutter:stable]"
          tabIndex={0}
          aria-label={`Diff for ${file}`}
        >
          <div className="min-w-full w-max pt-[10px] px-0 pb-[20px] font-mono text-[10.5px] leading-[22px]">
            {lines.map((line, index) => (
              <div
                className={cn(
                  "flex min-h-[22px] min-w-full",
                  line.kind === "addition" && "bg-diff-addition text-diff-addition-foreground",
                  line.kind === "deletion" && "bg-diff-deletion text-diff-deletion-foreground",
                  line.kind === "hunk" && "bg-diff-hunk text-diff-hunk-foreground mt-[7px]",
                  line.kind === "meta" && "text-muted-foreground",
                )}
                key={index}
              >
                <span className="w-[30px] flex-none text-right text-line-number pr-[7px] select-none tabular-nums">
                  {line.oldLine}
                </span>
                <span className="w-[30px] flex-none text-right text-line-number pr-[7px] select-none tabular-nums">
                  {line.newLine}
                </span>
                <code className="whitespace-pre py-0 pr-[14px] pl-[7px]">{line.text || " "}</code>
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
