import {
  NotFoundError,
  RateLimitedError,
  UpstreamUnavailableError,
  ValidationError,
  ForbiddenError,
} from "@/common/errors/app-error";
import { mapLimit } from "@/common/utils/map-limit";
import type { DiscordMessage } from "@/modules/discord/domain/feed";
import type { Group } from "../domain/group";
import { MAX_STACK, MIN_STACK, planStack, type StackPlan } from "../domain/stack-planner";
import type { PlannerContextDto, StackPlanDto } from "../dtos/responses/stack-planner.dto";
import type {
  MemberProfiles,
  PartySource,
  PlannerDiscord,
  PlannerGamesSource,
  PlannerPresence,
} from "../groups.ports";

export interface PlannerViewer {
  id: string;
  accountId32: number;
  steamId64: string;
}

/**
 * The stack planner on a group page: who's in tonight, then a lineup from members' own recent
 * games and the stack's confirmed party games (domain/stack-planner). Reads the Together
 * cache only (the party section checks pairs against OpenDota); members' lanes come from the
 * Meta page's cached source. Hero options and posting to Discord are Plus.
 */
export class StackPlannerService {
  constructor(
    private readonly deps: {
      party: Pick<PartySource, "sameTeamAmong">;
      games: PlannerGamesSource;
      profiles: MemberProfiles;
      presence: PlannerPresence;
      discord: PlannerDiscord;
      isPlus: (userId: string) => Promise<boolean>;
      /** The post, in the viewer's language. */
      message: (
        plan: StackPlanDto,
        names: Map<number, string | null>,
        locale: string,
        groupName: string,
      ) => DiscordMessage;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  async context(viewer: PlannerViewer, group: Group): Promise<PlannerContextDto> {
    const ids = group.members.map((m) => m.accountId32);
    const [playingNow, plus] = await Promise.all([
      this.deps.presence.playingNow({
        userId: viewer.id,
        accountId32: viewer.accountId32,
        steamId64: viewer.steamId64,
      }),
      this.deps.isPlus(viewer.id).catch(() => false),
    ]);
    const playing = ids.filter((id) => id !== viewer.accountId32 && playingNow.includes(id));
    // Nobody else seen in Dota: a small group starts with everyone ticked, a big one with you.
    const defaultIn =
      playing.length > 0
        ? [viewer.accountId32, ...playing].slice(0, MAX_STACK)
        : ids.length <= MAX_STACK
          ? ids
          : [viewer.accountId32];
    const discord = plus ? await this.deps.discord.channel(viewer.id).catch(() => null) : null;
    return { defaultIn, playing, plus, discord };
  }

  async plan(viewer: PlannerViewer, group: Group, memberIds: readonly number[]) {
    const ids = [...new Set(memberIds)];
    if (ids.length < MIN_STACK || ids.length > MAX_STACK)
      throw new ValidationError(`Pick ${MIN_STACK} to ${MAX_STACK} members.`);
    const inGroup = new Set(group.members.map((m) => m.accountId32));
    // Only this group's members: anyone else is "not found", like the group itself.
    if (ids.some((id) => !inGroup.has(id))) throw new NotFoundError("Member not found");

    const [rows, heroes, plus, members] = await Promise.all([
      this.deps.party.sameTeamAmong(ids),
      this.deps.games.heroes(),
      this.deps.isPlus(viewer.id).catch(() => false),
      mapLimit(ids, 3, async (accountId32) => ({
        accountId32,
        games: await this.deps.games.laneGames(accountId32).catch(() => null),
      })),
    ]);
    if (members.every((m) => m.games === null))
      throw new UpstreamUnavailableError("Couldn't read anyone's recent games. Try again soon.");
    const plan = planStack({
      members,
      viewer: viewer.accountId32,
      partyRows: rows,
      rolesOf: (id) => heroes.get(id)?.roles,
      now: this.now(),
    });
    return toDto(plan, plus, heroes);
  }

  /** Posts the plan to the viewer's own Discord channel (Plus). */
  async postToDiscord(
    viewer: PlannerViewer,
    group: Group,
    memberIds: readonly number[],
    locale: string,
  ): Promise<{ channel: string | null }> {
    if (!(await this.deps.isPlus(viewer.id)))
      throw new ForbiddenError("Posting a plan to Discord is part of Dota Den Plus.");
    const channel = await this.deps.discord.channel(viewer.id);
    if (!channel) throw new NotFoundError("Save a Discord webhook on your account page first.");
    const plan = await this.plan(viewer, group, memberIds);
    const profiles = await this.deps.profiles.profiles(
      group.members.filter((m) => memberIds.includes(m.accountId32)),
    );
    const names = new Map([...profiles].map(([id, p]) => [id, p.personaName]));
    const outcome = await this.deps.discord.post(
      viewer.id,
      this.deps.message(plan, names, locale, group.name),
    );
    switch (outcome.kind) {
      case "ok":
        return { channel: channel.name };
      case "none":
      case "gone":
        throw new NotFoundError("Discord says this webhook was deleted. Save a new one first.");
      case "rate_limited":
        throw new RateLimitedError(
          "Discord asked us to slow down. Try again shortly.",
          Math.ceil(outcome.retryAfterMs / 1000),
        );
      default:
        throw new UpstreamUnavailableError("Couldn't reach Discord. Try again.");
    }
  }
}

/** Hero options only with Plus; the catalog entries for the heroes shown. */
function toDto(
  plan: StackPlan,
  plus: boolean,
  heroes: Map<number, StackPlanDto["heroInfo"][number]>,
): StackPlanDto {
  const slots = plan.slots.map((s) => ({ ...s, heroes: plus ? s.heroes : [] }));
  const heroInfo: StackPlanDto["heroInfo"] = {};
  for (const s of slots)
    for (const h of s.heroes) {
      const info = heroes.get(h.heroId);
      if (info) heroInfo[h.heroId] = info;
    }
  return { ...plan, slots, heroesLocked: !plus, heroInfo };
}
