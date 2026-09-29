/** Dota Den emblem: a faceted shield with an ember core. Decorative. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <linearGradient id="dd-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.88 0.12 85)" />
          <stop offset="1" stopColor="oklch(0.62 0.13 60)" />
        </linearGradient>
        <radialGradient id="dd-ember" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor="oklch(0.75 0.19 45)" />
          <stop offset="1" stopColor="oklch(0.45 0.18 30)" />
        </radialGradient>
      </defs>
      <path
        d="M16 2 28 7v8.5C28 23 22.8 28.4 16 30 9.2 28.4 4 23 4 15.5V7L16 2Z"
        fill="url(#dd-gold)"
      />
      <path
        d="M16 5.2 25.2 9v6.6c0 5.8-4 10-9.2 11.3-5.2-1.3-9.2-5.5-9.2-11.3V9L16 5.2Z"
        fill="oklch(0.16 0.01 40)"
      />
      <path d="m16 9 5 7-5 7-5-7 5-7Z" fill="url(#dd-ember)" />
    </svg>
  );
}
