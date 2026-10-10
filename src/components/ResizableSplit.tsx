import type { ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";

const layoutStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Resizing still works when preferences cannot be saved. */
    }
  },
};

export function ResizableSplit({
  id,
  orientation,
  primary,
  secondary,
  primarySize,
  secondarySize,
  primaryMin,
  secondaryMin,
  label,
  className,
}: {
  id: string;
  orientation: "horizontal" | "vertical";
  primary: ReactNode;
  secondary?: ReactNode;
  primarySize?: number | string;
  secondarySize?: number | string;
  primaryMin: number;
  secondaryMin: number;
  label: string;
  className: string;
}) {
  const primaryId = `${id}-primary`;
  const secondaryId = `${id}-secondary`;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `gitler.layout.${id}`,
    panelIds: secondary ? [primaryId, secondaryId] : [primaryId],
    storage: layoutStorage,
    onlySaveAfterUserInteractions: true,
  });
  return (
    <ResizablePanelGroup
      id={id}
      orientation={orientation}
      className={className}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      resizeTargetMinimumSize={{ coarse: 24, fine: 12 }}
    >
      <ResizablePanel
        id={primaryId}
        className="resizable-pane"
        defaultSize={secondary ? primarySize : "100%"}
        minSize={primaryMin}
      >
        {primary}
      </ResizablePanel>
      {secondary && (
        <>
          <ResizableHandle className="pane-resize-handle" aria-label={label} withHandle />
          <ResizablePanel
            id={secondaryId}
            className="resizable-pane"
            defaultSize={secondarySize}
            minSize={secondaryMin}
          >
            {secondary}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
