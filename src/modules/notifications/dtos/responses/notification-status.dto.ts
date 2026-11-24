import type { NotificationPrefs } from "../../domain/notification";

/** The account page's notifications section. */
export interface NotificationStatusDto {
  /** False when the server has no push keys: the section explains it's unavailable. */
  enabled: boolean;
  /** This player's subscribed devices (the browser checks whether it's one of them). */
  endpoints: string[];
  prefs: NotificationPrefs;
}

export interface TriggerRunDto {
  users: number;
  sessionRecaps: number;
  weeklyRecaps: number;
  patchHeroes: number;
  /** "Your free Plus trial ends soon" reminders sent. */
  trialReminders: number;
  /** "Your year in Dota is ready" pushes sent (late December). */
  yearReviews: number;
  failed: number;
  stoppedEarly: boolean;
}
