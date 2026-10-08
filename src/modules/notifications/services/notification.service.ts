import type { DataOwner } from "@/common/privacy/user-data";
import {
  DEFAULT_PREFS,
  type NotificationKind,
  type NotificationMessage,
  type NotificationPrefs,
} from "../domain/notification";
import type {
  NotificationLogPort,
  PushSender,
  SettingsRepositoryPort,
  StoredSubscription,
  SubscriptionsRepositoryPort,
} from "../notifications.ports";
import type { NotificationStatusDto } from "../dtos/responses/notification-status.dto";

/** Devices, preferences and delivery. Sending is a no-op when push isn't configured. */
export class NotificationService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      subscriptions: SubscriptionsRepositoryPort;
      settings: SettingsRepositoryPort;
      log: NotificationLogPort;
      /** Null when the VAPID keys aren't set: the feature is off. */
      sender: PushSender | null;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.deps.sender !== null;
  }

  async status(userId: string): Promise<NotificationStatusDto> {
    const [devices, prefs] = await Promise.all([
      this.deps.subscriptions.forUser(userId),
      this.deps.settings.prefs(userId),
    ]);
    return {
      enabled: this.enabled,
      endpoints: devices.map((d) => d.endpoint),
      prefs: prefs ?? DEFAULT_PREFS,
    };
  }

  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: StoredSubscription["keys"] },
    userAgent: string | null,
  ): Promise<void> {
    await this.deps.subscriptions.save({ ...sub, userId, userAgent }, this.now());
  }

  unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    return this.deps.subscriptions.remove(userId, endpoint);
  }

  async setPrefs(userId: string, prefs: NotificationPrefs): Promise<NotificationPrefs> {
    await this.deps.settings.savePrefs(userId, prefs, this.now());
    return prefs;
  }

  async prefs(userId: string): Promise<NotificationPrefs> {
    return (await this.deps.settings.prefs(userId)) ?? DEFAULT_PREFS;
  }

  subscribedUserIds(): Promise<string[]> {
    return this.deps.subscriptions.subscribedUserIds();
  }

  /** Sends to every device of the player; dead devices are forgotten. Returns how many got it. */
  async deliver(userId: string, message: NotificationMessage): Promise<number> {
    const sender = this.deps.sender;
    if (!sender) return 0;
    const devices = await this.deps.subscriptions.forUser(userId);
    const reached: string[] = [];
    await Promise.all(
      devices.map(async (device) => {
        const outcome = await sender.send(device, message);
        if (outcome.ok) reached.push(device.endpoint);
        else if (outcome.gone) await this.deps.subscriptions.removeEndpoint(device.endpoint);
      }),
    );
    await this.deps.subscriptions.markSent(reached, this.now());
    return reached.length;
  }

  /**
   * Sends one piece of news at most once (per kind and key), only if the player wants that
   * kind. `build` runs only when it will be sent. Returns how many devices got it.
   */
  async notifyOnce(
    userId: string,
    kind: NotificationKind,
    key: string,
    build: () => Promise<NotificationMessage | null>,
  ): Promise<number> {
    if (!this.enabled) return 0;
    if (!(await this.prefs(userId))[kind]) return 0;
    const message = await build();
    if (!message) return 0;
    if (!(await this.deps.log.claim(userId, kind, key, this.now()))) return 0;
    const delivered = await this.deliver(userId, message);
    // Nobody got it (every device gone or failing): let a later run try again.
    if (delivered === 0) await this.deps.log.release(userId, kind, key);
    else await this.deps.log.recordDelivered(userId, kind, key, delivered);
    return delivered;
  }

  async exportMyData(owner: DataOwner) {
    const [devices, settings, sent] = await Promise.all([
      this.deps.subscriptions.exportForOwner(owner),
      this.deps.settings.exportForOwner(owner),
      this.deps.log.exportForOwner(owner),
    ]);
    return {
      notificationDevices: devices,
      notificationSettings: settings,
      notificationsSent: sent,
    };
  }

  async deleteMyData(owner: DataOwner) {
    const [devices, settings, sent] = await Promise.all([
      this.deps.subscriptions.deleteForOwner(owner),
      this.deps.settings.deleteForOwner(owner),
      this.deps.log.deleteForOwner(owner),
    ]);
    return {
      notificationDevices: devices,
      notificationSettings: settings,
      notificationsSent: sent,
    };
  }
}
