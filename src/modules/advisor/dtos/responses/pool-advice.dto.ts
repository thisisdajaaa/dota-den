import type { Advice, Nemesis } from "../../domain/pool-advice";
import type { Position } from "../../advisor.ports";

export type PoolAdviceView =
  | { status: "ok"; position: Position; windowDays: number; nemeses: Nemesis[]; advice: Advice[] }
  | { status: "no_role" | "unavailable" };
