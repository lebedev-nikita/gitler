"""Enforce the five-minute budget for a warmed desktop packaging run."""

from datetime import datetime, timezone
import os
from pathlib import Path
import sys


started = datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
elapsed = (datetime.now(timezone.utc) - started).total_seconds()
message = f"Full desktop packaging: {elapsed:.0f}s / 300s budget"
print(message)
if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
    with Path(summary).open("a") as output:
        output.write(f"{message}\n")
if elapsed > 300:
    raise SystemExit("Desktop packaging exceeded the five-minute budget")
