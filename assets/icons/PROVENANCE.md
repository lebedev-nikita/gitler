# Icon sources

`base.png` is the unmodified replacement PNG provided by the user, including
the Gitler wordmark.
The Tauri bundle icons are generated from it with the official Tauri CLI.

`mark.png` is the text-free variant created with the built-in ImageGen tool.
It keeps the cream and red emblem on a charcoal rounded square, centers and
enlarges the emblem, and preserves transparency outside the square.
T3 Code uses this source through `t3.json`.

`favicon.png` (256 pixels) and `favicon.ico` (16, 32, 48, and 64 pixels) are
resized exports of `mark.png` made with ImageMagick, referenced by `index.html`.
