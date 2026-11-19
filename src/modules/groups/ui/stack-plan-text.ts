/**
 * The words of a stack plan (pure, used by the planner card, its copy-to-chat text and the
 * Discord post). Every number comes from the plan; nothing is added here.
 */
import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import type { Position } from "@/modules/meta/domain/position";
import {
  MIN_COMBO_GAMES,
  MIN_POSITION_RECORD,
  MIN_STACK,
  MAX_STACK,
  SHRINK_GAMES,
  type PlannedSlot,
  type PositionCombo,
  type Tally,
} from "../domain/stack-planner";
import type { StackPlanDto } from "../dtos/responses/stack-planner.dto";

type T = Translator<Messages>;
export type NameOf = (accountId32: number) => string;

export { MIN_STACK, MAX_STACK };

/** "9–4" (wins–losses over decided games). */
export const wl = (t: Pick<Tally, "decided" | "wins">) => `${t.wins}–${t.decided - t.wins}`;

const KEYS = ["1", "2", "3", "4", "5"] as const;
export const posLabel = (t: T, p: Position) => t(`groups.planner.positions.${KEYS[p - 1]}`);
export const roleLabel = (t: T, p: Position) => t(`groups.planner.positionNames.${KEYS[p - 1]}`);

/** Why this member got this position, with sample sizes. */
export function slotEvidence(t: T, slot: PlannedSlot, windowDays: number): string[] {
  const pos = posLabel(t, slot.position);
  const lines: string[] = [];
  switch (slot.basis) {
    case "record":
      lines.push(
        t("groups.planner.record", { wl: wl(slot.own), pos, days: windowDays }) +
          (slot.smallSample ? ` (${t("groups.planner.smallSample")})` : ""),
      );
      break;
    case "most_played":
      lines.push(
        t("groups.planner.mostPlayed", {
          games: plural(t, "groups.units.game", slot.placed),
          pos: posLabel(t, slot.mostPlayed[0] ?? slot.position),
        }),
      );
      break;
    case "leftover":
      lines.push(
        slot.own.decided > 0
          ? t("groups.planner.leftover", { pos, wl: wl(slot.own) })
          : t("groups.planner.leftoverNone", { pos }),
      );
      break;
    case "no_data":
      lines.push(t("groups.planner.noData", { days: windowDays }));
      break;
  }
  const extra: string[] = [];
  if (slot.together.decided > 0)
    extra.push(t("groups.planner.withStack", { pos, wl: wl(slot.together) }));
  if (slot.withYou && slot.withYou.decided > 0)
    extra.push(t("groups.planner.withYou", { wl: wl(slot.withYou) }));
  if (extra.length > 0) lines.push(extra.join(" · "));
  return lines;
}

export function comboText(t: T, c: PositionCombo, nameOf: NameOf, avoid: boolean): string {
  const vars = {
    a: nameOf(c.a.accountId32),
    posA: posLabel(t, c.a.position),
    b: nameOf(c.b.accountId32),
    posB: posLabel(t, c.b.position),
    wl: wl(c),
  };
  return avoid ? t("groups.planner.avoidNote", vars) : t("groups.planner.combo", vars);
}

/** Notes under the lineup: record together, unknown party data, thin data. */
export function planNotes(t: T, plan: StackPlanDto, nameOf: NameOf): string[] {
  const days = plan.windowDays;
  const notes: string[] = [];
  if (plan.together.decided > 0) {
    notes.push(t("groups.planner.together", { days, wl: wl(plan.together) }));
    if (plan.exact.decided > 0) notes.push(t("groups.planner.exact", { wl: wl(plan.exact) }));
  } else notes.push(t("groups.planner.togetherNone", { days }));
  if (plan.unknownGames > 0)
    notes.push(
      t("groups.planner.unknown", { games: plural(t, "groups.units.game", plan.unknownGames) }),
    );
  if (plan.togetherUnplaced > 0)
    notes.push(
      t("groups.planner.unplaced", {
        games: plural(t, "groups.units.game", plan.togetherUnplaced),
      }),
    );
  if (plan.thin) notes.push(t("groups.planner.thin"));
  if (plan.unavailable.length > 0)
    notes.push(t("groups.planner.unavailable", { names: plan.unavailable.map(nameOf).join(", ") }));
  return notes;
}

export function howItWorks(t: T): string {
  return t("groups.planner.howBody", {
    shrink: SHRINK_GAMES,
    min: MIN_POSITION_RECORD,
    combo: MIN_COMBO_GAMES,
  });
}

const heroNames = (plan: StackPlanDto, slot: PlannedSlot) =>
  slot.heroes.map((h) => `${plan.heroInfo[h.heroId]?.name ?? `#${h.heroId}`} ${wl(h)}`).join(", ");

/** The plan as plain text for a group chat (Messenger, Viber, Discord). */
export function planLines(
  t: T,
  plan: StackPlanDto,
  nameOf: NameOf,
): { title: (group: string) => string; body: string[] } {
  const body: string[] = [];
  for (const slot of plan.slots) {
    const head = t("groups.planner.text.slot", {
      pos: posLabel(t, slot.position),
      role: roleLabel(t, slot.position),
      name: nameOf(slot.accountId32),
    });
    body.push(`${head}: ${slotEvidence(t, slot, plan.windowDays).join(" · ")}`);
    if (slot.heroes.length > 0)
      body.push(`   ${t("groups.planner.text.heroes", { heroes: heroNames(plan, slot) })}`);
  }
  body.push("");
  body.push(...planNotes(t, plan, nameOf));
  for (const c of plan.avoid)
    body.push(`${t("groups.planner.avoidTitle")}: ${comboText(t, c, nameOf, true)}`);
  return {
    title: (group) => t("groups.planner.text.title", { group }),
    body,
  };
}

export function planText(t: T, plan: StackPlanDto, nameOf: NameOf, group: string): string {
  const { title, body } = planLines(t, plan, nameOf);
  return [title(group), "", ...body, "", `${t("groups.planner.text.footer")} dota-den.com`].join(
    "\n",
  );
}
