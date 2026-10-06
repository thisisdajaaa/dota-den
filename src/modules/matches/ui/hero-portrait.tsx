import Image from "next/image";
import { cn } from "cn";
import type { HeroInfo } from "../matches.ports";

const SIZES = {
  xs: "h-6 w-[2.67rem]",
  sm: "h-8 w-[3.56rem]",
  md: "h-10 w-[4.44rem]",
  lg: "h-14 w-[6.22rem]",
} as const;

/** CSS widths in px, so the browser picks a 1x or 2x image instead of a long size list. */
const WIDTHS = { xs: 43, sm: 57, md: 71, lg: 100 } as const;

/** Hero portrait (16:9) with a graceful fallback when the catalog is unavailable. */
export function HeroPortrait({
  hero,
  heroId,
  size = "sm",
  className,
  displayWidth,
}: {
  hero: HeroInfo | undefined;
  heroId: number;
  size?: keyof typeof SIZES;
  className?: string;
  /** Widest the portrait is shown at, when a className stretches it (e.g. a grid cell). */
  displayWidth?: number;
}) {
  const width = displayWidth ?? WIDTHS[size];
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-white/10",
        SIZES[size],
        className,
      )}
    >
      {hero?.imageUrl ? (
        <Image
          src={hero.imageUrl}
          alt=""
          width={width}
          height={Math.round((width * 9) / 16)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="grid h-full place-items-center px-1 text-center text-[0.55rem] leading-tight text-muted-foreground">
          {hero?.name ?? `#${heroId}`}
        </span>
      )}
    </span>
  );
}

export function heroName(hero: HeroInfo | undefined, heroId: number): string {
  return hero?.name ?? `Hero #${heroId}`;
}
