"""Enforce the three-minute budget for a warmed desktop pipeline run."""

from datetime import datetime, timezone
import os
from pathlib import Path
import sys


started = datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
elapsed = (datetime.now(timezone.utc) - started).total_seconds()
message = f"Desktop pipeline: {elapsed:.0f}s / 180s budget"
print(message)
if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
    with Path(summary).open("a") as output:
        output.write(f"{message}\n")
if elapsed > 180:
    raise SystemExit("Desktop pipeline exceeded the three-minute budget")
