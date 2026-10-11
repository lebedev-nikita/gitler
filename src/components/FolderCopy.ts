import { createLucideIcon } from "lucide-react";

export const FolderCopy = createLucideIcon("FolderCopy", [
  [
    "path",
    {
      d: "M10 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v3",
      key: "folder",
    },
  ],
  ["rect", { x: "16", y: "16", width: "6", height: "6", rx: "1", key: "copy-front" }],
  ["path", { d: "M13 19a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1", key: "copy-back" }],
]);
