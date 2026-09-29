import Image from "next/image";
import { cn } from "cn";

const SIZES = { sm: "size-9", md: "size-11", lg: "size-14" } as const;
const PX = { sm: 36, md: 44, lg: 56 } as const;

/** Steam avatar with an initial as the fallback (no avatar, or an untrusted host). */
export function PlayerAvatar({
  url,
  name,
  size = "md",
  className,
}: {
  url: string | null;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-white/10",
        SIZES[size],
        className,
      )}
    >
      {url ? (
        <Image src={url} alt="" fill sizes={`${PX[size]}px`} className="object-cover" />
      ) : (
        <span
          aria-hidden
          className="grid size-full place-items-center font-display text-sm font-bold text-gold"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export function displayName(personaName: string | null, accountId32: number): string {
  return personaName ?? `Player ${accountId32}`;
}
