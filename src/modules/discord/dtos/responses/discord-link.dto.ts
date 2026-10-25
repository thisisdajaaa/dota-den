/** The account page's "Discord account" card. */
export interface DiscordLinkStatus {
  /** "Connect Discord" is set up on this server. */
  enabled: boolean;
  linked: { username: string; globalName: string | null; avatarUrl: string | null } | null;
}
