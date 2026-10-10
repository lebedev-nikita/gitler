import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

export function useStoredBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === "true" ? true : saved === "false" ? false : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* Layout preferences are optional when storage is unavailable. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useNarrowLayout() {
  const media = useMemo(() => window.matchMedia("(max-width: 760px)"), []);
  const subscribe = useCallback(
    (listener: () => void) => {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    [media],
  );
  return useSyncExternalStore(subscribe, () => media.matches);
}
