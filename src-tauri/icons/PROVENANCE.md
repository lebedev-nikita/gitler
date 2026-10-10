# Icon provenance

All four bundle icons were generated from the user-provided
[`assets/icons/base.png`](../../assets/icons/base.png), retaining the Gitler
wordmark, with the official Tauri CLI:

```sh
bun run tauri icon assets/icons/base.png --output /tmp/gitler-app-icons
```

The bundle uses `32x32.png`, `128x128.png`, `128x128@2x.png`, and `icon.icns`
from that output. See [source provenance](../../assets/icons/PROVENANCE.md)
for the separate text-free variant and its generation prompts.
