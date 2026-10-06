import type { MmrEntry } from "../../domain/mmr-entry";

export interface MmrEntryDto {
  id: string;
  mmr: number;
  observedAt: string;
  note: string | null;
}

export function toMmrEntryDto(e: MmrEntry): MmrEntryDto {
  return { id: e.id, mmr: e.mmr, observedAt: e.observedAt.toISOString(), note: e.note };
}
