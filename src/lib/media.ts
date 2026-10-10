export function mediaKind(path: string): "image" | "video" | "audio" | null {
  const filename = path.split("/").at(-1);
  if (!filename?.includes(".")) return null;
  const extension = filename.split(".").at(-1)?.toLowerCase();
  if (!extension) return null;
  if (
    ["png", "apng", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"].includes(extension)
  )
    return "image";
  if (["mp4", "m4v", "webm", "mov", "ogv"].includes(extension)) return "video";
  if (["mp3", "wav", "ogg", "oga", "opus", "flac", "aac", "m4a", "aif", "aiff"].includes(extension))
    return "audio";
  return null;
}
