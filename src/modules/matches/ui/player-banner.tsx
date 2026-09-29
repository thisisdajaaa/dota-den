import Image from "next/image";
import type { PlayerProfileSnapshot } from "../application/ports";
import { parseRankTier } from "../domain/rank-tier";
import { RankBadge } from "./rank-badge";

export function PlayerBanner({
  profile,
  accountId32,
  children,
}: {
  profile: PlayerProfileSnapshot | null;
  accountId32: number;
  /** Right-aligned slot (sync status). */
  children?: React.ReactNode;
}) {
  const rank = parseRankTier(profile?.rankTier);
  const name = profile?.personaName ?? `Player ${accountId32}`;

  return (
    <section className="panel overflow-hidden p-5 sm:p-6" aria-label="Player">
      {/* Decorative glow behind the avatar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-gold/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative size-20 shrink-0 sm:size-24">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-gold/70 via-gold/10 to-transparent" />
          <div className="relative size-full overflow-hidden rounded-xl bg-muted ring-1 ring-black/40">
            {profile?.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
                priority
              />
            ) : (
              <span className="grid size-full place-items-center font-display text-3xl text-gold">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="kicker">Your den</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate font-display text-3xl font-bold tracking-wide sm:text-4xl">
              {name}
            </h1>
            {rank && <RankBadge rank={rank} />}
          </div>
          <p className="font-mono text-xs text-muted-foreground">Account {accountId32}</p>
        </div>

        <div className="sm:self-start">{children}</div>
      </div>
    </section>
  );
}
