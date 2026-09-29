import Image from "next/image";
import { cn } from "cn";
import type { HeroInfo } from "../application/ports";

const SIZES = {
  xs: "h-6 w-[2.67rem]",
  sm: "h-8 w-[3.56rem]",
  md: "h-10 w-[4.44rem]",
  lg: "h-14 w-[6.22rem]",
} as const;

/** Hero portrait (16:9) with a graceful fallback when the catalog is unavailable. */
export function HeroPortrait({
  hero,
  heroId,
  size = "sm",
  className,
}: {
  hero: HeroInfo | undefined;
  heroId: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-white/10",
        SIZES[size],
        className,
      )}
    >
      {hero?.imageUrl ? (
        <Image src={hero.imageUrl} alt="" fill sizes="112px" className="object-cover" />
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
