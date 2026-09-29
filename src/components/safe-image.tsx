"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/** next/image that disappears instead of showing a broken icon when the source 404s. */
export function SafeImage(props: ImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line jsx-a11y/alt-text -- alt is passed through from props
  return <Image {...props} onError={() => setFailed(true)} />;
}
