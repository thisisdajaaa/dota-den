import Image from "next/image";
import { getT } from "@/common/i18n/server";
import type { HeroInfo, PlayerProfileSnapshot } from "../matches.ports";
import { parseRankTier } from "../domain/rank-tier";
import { formatPercent } from "./format";
import { RankMedal, rankLabel } from "./rank-medal";

export interface SignatureHero {
  hero: HeroInfo;
  games: number;
  winRate: number | null;
}

export async function PlayerBanner({
  profile,
  accountId32,
  signature,
  kicker,
  children,
}: {
  profile: PlayerProfileSnapshot | null;
  accountId32: number;
  /** Most-played hero in the current view; its render sits behind the banner. */
  signature?: SignatureHero | null;
  /** Small label above the name. */
  kicker?: string;
  /** Right-aligned slot (sync status). */
  children?: React.ReactNode;
}) {
  const t = await getT();
  const rank = parseRankTier(profile?.rankTier, profile?.leaderboardRank);
  const name = profile?.personaName ?? t("matches.banner.fallbackName", { id: accountId32 });

  return (
    <section
      className="panel relative isolate overflow-hidden"
      aria-label={t("matches.banner.label")}
    >
      {signature?.hero.renderUrl && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full [mask-image:linear-gradient(to_left,black_35%,transparent)] sm:w-[62%]"
        >
          <Image
            src={signature.hero.renderUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 640px, 100vw"
            className="scale-110 object-cover object-[center_8%] opacity-45 sm:opacity-70"
            priority
          />
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 -z-10 size-72 rounded-full bg-gold/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-card/90 to-transparent"
      />

      <div className="flex flex-col gap-6 p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <p className="kicker">{kicker ?? t("matches.banner.kicker")}</p>
          {children}
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="relative size-20 shrink-0 sm:size-28">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-gold/80 via-gold/10 to-transparent" />
              <div className="relative size-full overflow-hidden rounded-xl bg-muted ring-1 ring-black/40">
                {profile?.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt=""
                    width={112}
                    height={112}
                    className="absolute inset-0 size-full object-cover"
                    priority
                  />
                ) : (
                  <span className="grid size-full place-items-center font-display text-3xl text-gold">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            {rank && (
              <RankMedal
                rank={rank}
                size={80}
                className="drop-shadow-[0_6px_18px_rgb(0_0_0/0.6)] sm:hidden"
              />
            )}
          </div>

          <div className="min-w-0 space-y-1.5">
            <h1 className="truncate font-display text-4xl font-bold tracking-wide drop-shadow-[0_2px_12px_rgb(0_0_0/0.6)] sm:text-5xl">
              {name}
            </h1>
            {rank && <p className="text-sm font-semibold text-gold">{rankLabel(rank)}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{t("matches.banner.account", { id: accountId32 })}</span>
              {signature && (
                <span>
                  {t("matches.banner.signatureHero")}{" "}
                  <span className="font-semibold text-foreground">{signature.hero.name}</span> ·{" "}
                  {t("matches.banner.signatureStats", {
                    games: signature.games,
                    rate: formatPercent(signature.winRate),
                  })}
                </span>
              )}
            </div>
          </div>
          {rank && (
            <RankMedal
              rank={rank}
              size={120}
              className="hidden drop-shadow-[0_6px_18px_rgb(0_0_0/0.6)] sm:-my-6 sm:ml-2 sm:block"
            />
          )}
        </div>
      </div>
    </section>
  );
}
