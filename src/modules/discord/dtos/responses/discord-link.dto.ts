/** The account page's "Discord account" card. */
export interface DiscordLinkStatus {
  /** "Connect Discord" is set up on this server. */
  enabled: boolean;
  linked: {
    username: string;
    globalName: string | null;
    avatarUrl: string | null;
    /** Tilt / stop-loss nudges on Discord. */
    nudges: "off" | "dm" | "server";
  } | null;
  /** "Add the bot to your server" (null until the bot is set up). */
  inviteUrl: string | null;
  /** The bot can send DMs and channel posts (its token is set). */
  canNudge: boolean;
}
