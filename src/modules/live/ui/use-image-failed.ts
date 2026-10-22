"use client";

import { useCallback, useState } from "react";

/**
 * Whether an image failed to load, for showing a fallback. Also catches images that failed
 * before hydration (server-rendered <img> errors fire before React listens for them).
 */
export function useImageFailed(): {
  failed: boolean;
  onError: () => void;
  check: (img: HTMLImageElement | null) => void;
} {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const check = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  return { failed, onError, check };
}
