import { AppTooltip } from "@/components/AppTooltip";
import { useState } from "react";
import { Image, Music2, Video } from "lucide-react";
import type { MediaResult, MediaVersion } from "@/lib/models";
import { mediaKind } from "@/lib/media";
import { ClosePreviewButton, EmptyMessage } from "./common";

const mediaIcons = { image: Image, video: Video, audio: Music2 };

function fileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}

function MediaSide({
  version,
  label,
  file,
}: {
  version: MediaVersion;
  label: string;
  file: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ source: string; value: string } | null>(null);
  const source = version.dataUrl;
  const kind = version.mime.startsWith("video/")
    ? "video"
    : version.mime.startsWith("audio/")
      ? "audio"
      : "image";
  const Icon = mediaIcons[kind];
  const error =
    version.error ??
    (source && failedSource === source
      ? "This format or codec cannot be displayed here, or the file is damaged."
      : null);
  return (
    <section className="flex min-w-0 flex-col gap-[10px]" aria-label={`${label} media`}>
      <div className="flex flex-wrap items-center gap-[8px] text-[11px] text-muted-foreground">
        <strong className="text-foreground font-medium">{label}</strong>
        {dimensions?.source === source && <span className="tabular-nums">{dimensions.value}</span>}
        {version.size !== null && (
          <span className="ml-auto tabular-nums">{fileSize(version.size)}</span>
        )}
      </div>
      {error || !source ? (
        <EmptyMessage
          icon={Icon}
          title="Preview unavailable"
          description={error ?? "No media content is available."}
        />
      ) : kind === "image" ? (
        <div className="flex min-h-[100px] items-center justify-center bg-background p-[12px]">
          <img
            src={source}
            alt={`${label}: ${file}`}
            className="block max-h-[360px] max-w-full object-contain"
            onError={() => setFailedSource(source)}
            onLoad={(event) =>
              setDimensions({
                source,
                value: `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`,
              })
            }
          />
        </div>
      ) : kind === "video" ? (
        <video
          key={source}
          src={source}
          controls
          playsInline
          preload="metadata"
          aria-label={`${label}: ${file}`}
          className="block max-h-[360px] w-full bg-background"
          onError={() => setFailedSource(source)}
          onLoadedMetadata={(event) =>
            setDimensions({
              source,
              value: `${event.currentTarget.videoWidth} × ${event.currentTarget.videoHeight}`,
            })
          }
        />
      ) : (
        <audio
          key={source}
          src={source}
          controls
          preload="metadata"
          aria-label={`${label}: ${file}`}
          className="w-full"
          onError={() => setFailedSource(source)}
        />
      )}
    </section>
  );
}

export function MediaView({
  media,
  file,
  close,
}: {
  media: MediaResult;
  file: string;
  close: () => void;
}) {
  const Icon = mediaIcons[mediaKind(file) ?? "image"];
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
      <div className="flex gap-[8px] items-center px-[15px] h-[39px] flex-none bg-secondary">
        <Icon className="size-[14px] text-muted-foreground flex-none" />
        <AppTooltip content={file}>
          <span className="flex-1 truncate font-mono text-[10px]">{file}</span>
        </AppTooltip>
        <span className="text-muted-foreground text-[10px]">Preview</span>
        <ClosePreviewButton close={close} />
      </div>
      <div
        className="flex-1 min-h-0 overflow-auto bg-diff p-[15px] [scrollbar-gutter:stable]"
        tabIndex={0}
        aria-label={`Media preview for ${file}`}
      >
        <div className="flex flex-col gap-[24px]">
          {media.before && <MediaSide version={media.before} label="Before" file={file} />}
          {media.after && <MediaSide version={media.after} label="After" file={file} />}
          {!media.before && !media.after && (
            <EmptyMessage
              icon={Icon}
              title="No media in this view"
              description="This file is absent from both selected versions. Refresh the repository to update the file list."
            />
          )}
        </div>
      </div>
    </div>
  );
}
