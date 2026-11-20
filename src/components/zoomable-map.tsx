"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "cn";

const MIN = 1;
const MAX = 5;
const STEP = 1.5;

interface View {
  zoom: number;
  /** Pan offset in px of the frame, applied after scaling from the top-left corner. */
  x: number;
  y: number;
}

const clampView = (v: View, size: number): View => {
  const zoom = Math.min(MAX, Math.max(MIN, v.zoom));
  const min = size - size * zoom;
  return {
    zoom,
    x: Math.min(0, Math.max(min, v.x)),
    y: Math.min(0, Math.max(min, v.y)),
  };
};

/**
 * A square map that zooms and pans: the + and − buttons, double-click or double-tap, pinch, and
 * Ctrl/⌘ + scroll (a trackpad pinch) zoom in on a point; drag moves the zoomed map. A plain
 * scroll still scrolls the page. Markers inside can stay the same size on screen by scaling
 * with `calc(1 / var(--map-zoom))`.
 */
export function ZoomableMap({
  children,
  className,
  labels,
}: {
  children: ReactNode;
  className?: string;
  labels: { zoomIn: string; zoomOut: string; reset: string; hint: string };
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef(0);
  const dragged = useRef(false);

  const size = () => frame.current?.clientWidth ?? 1;

  /** Zoom to `zoom`, keeping the frame point (px, py) where it is on screen. */
  const zoomAt = useCallback((zoom: number, px: number, py: number) => {
    setView((v) => {
      const z = Math.min(MAX, Math.max(MIN, zoom));
      const k = z / v.zoom;
      return clampView({ zoom: z, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, size());
    });
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Ctrl/⌘ + wheel (and trackpad pinch, which reports as one) zooms; needs a non-passive listener.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const z = Math.min(MAX, Math.max(MIN, v.zoom * Math.exp(-e.deltaY * 0.01)));
        const k = z / v.zoom;
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        return clampView({ zoom: z, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, r.width);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    pointers.current.set(e.pointerId, local(e));
    dragged.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
    if (view.zoom > 1 || pointers.current.size === 2)
      e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      dragged.current = true;
      zoomAt(
        gesture.current.zoom * (dist / gesture.current.dist),
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
      );
      return;
    }
    if (view.zoom === 1) return;
    const dx = now.x - prev.x;
    const dy = now.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) dragged.current = true;
    setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, size()));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (dragged.current || pointers.current.size > 0) return;
    // A double tap (touch) zooms in where it lands.
    if (e.pointerType === "touch") {
      const t = Date.now();
      if (t - lastTap.current < 300) {
        const p = local(e);
        zoomAt(view.zoom >= MAX ? 1 : view.zoom * 2, p.x, p.y);
        lastTap.current = 0;
      } else lastTap.current = t;
    }
  };

  const center = () => size() / 2;
  const button =
    "grid size-9 place-items-center rounded-md border border-white/10 bg-black/70 text-white backdrop-blur hover:bg-black/85 disabled:opacity-40";

  return (
    <div className="space-y-1.5">
      <div
        ref={frame}
        data-testid="zoomable-map"
        data-zoom={view.zoom.toFixed(2)}
        className={cn(
          "relative aspect-square w-full touch-pan-y overflow-hidden select-none",
          view.zoom > 1 && "cursor-grab touch-none active:cursor-grabbing",
          className,
        )}
        style={{ ["--map-zoom" as string]: view.zoom }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          const p = local(e);
          zoomAt(view.zoom >= MAX ? 1 : view.zoom * 2, p.x, p.y);
        }}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          {children}
        </div>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button
            type="button"
            className={button}
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
            disabled={view.zoom >= MAX}
            onClick={() => zoomAt(view.zoom * STEP, center(), center())}
          >
            <Plus aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            className={button}
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
            disabled={view.zoom <= MIN}
            onClick={() => zoomAt(view.zoom / STEP, center(), center())}
          >
            <Minus aria-hidden className="size-4" />
          </button>
          {view.zoom > 1 && (
            <button
              type="button"
              className={button}
              aria-label={labels.reset}
              title={labels.reset}
              onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
            >
              <RotateCcw aria-hidden className="size-4" />
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{labels.hint}</p>
    </div>
  );
}
