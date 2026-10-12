import { AppTooltip } from "@/components/AppTooltip";
import { useState } from "react";
import { Check, Copy, AlertTriangle, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { LucideIcon } from "lucide-react";

export function ClosePreviewButton({ close }: { close: () => void }) {
  return (
    <AppTooltip content="Close diff preview">
      <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close diff preview">
        <X />
      </Button>
    </AppTooltip>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  title = label,
  size = "icon-xs",
  icon: Icon = Copy,
}: {
  value: string;
  label?: string;
  title?: string;
  size?: "icon-xs" | "icon-sm";
  icon?: LucideIcon;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <AppTooltip content={failed ? "Clipboard unavailable" : copied ? "Copied" : title}>
      <Button
        size={size}
        variant="ghost"
        aria-label={copied ? "Copied" : label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setFailed(false);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check /> : <Icon />}
      </Button>
    </AppTooltip>
  );
}

export function ErrorMessage({
  title,
  error,
  retry,
}: {
  title: string;
  error: unknown;
  retry?: () => void;
}) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {retry && (
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyMessage({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children}
    </Empty>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-[8px] py-[36px] px-[18px] text-muted-foreground text-[12px]"
      role="status"
    >
      <LoaderCircle className="animate-spin size-[15px]" />
      {text}
    </div>
  );
}

export const shortHash = (hash: string) => hash.slice(0, 7);
export const shortPath = (path: string) =>
  path.replace(/^\/Users\/[^/]+\//, "~/").replace(/^\/home\/[^/]+\//, "~/");
export const dateLabel = (timestamp: number) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(timestamp * 1000);
export const fullDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    timestamp * 1000,
  );
