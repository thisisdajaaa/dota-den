/** One go-live alert run (for logs and the job record). */
export interface StreamerAlertsRunDto {
  users: number;
  channels: number;
  live: number;
  sent: number;
  failed: number;
  skipped: "disabled" | "no_plus_users" | "no_devices" | "no_sites" | null;
}
