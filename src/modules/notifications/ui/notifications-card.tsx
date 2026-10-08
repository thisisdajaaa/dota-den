"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";
import { Button } from "@/components/ui/button";
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
  type NotificationPrefs,
} from "../domain/notification";

type DeviceState =
  | "checking"
  | "unsupported"
  /** iPhone/iPad Safari: push only works once the app is on the Home Screen. */
  | "needs_install"
  | "blocked"
  | "off"
  | "on";

/** The VAPID key as the bytes PushManager.subscribe() wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function supported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone and iPad only allow push for apps added to the Home Screen. */
function isIosBrowserTab() {
  try {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return ios && !standalone;
  } catch {
    return false;
  }
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration()) ??
    (await navigator.serviceWorker.register("/sw.js"))
  );
}

/** Opt-in notifications for this device, plus which kinds to get on every device. */
export function NotificationsCard({
  publicKey,
  endpoints,
  prefs: initialPrefs,
}: {
  /** Null when the server has no push keys. */
  publicKey: string | null;
  endpoints: string[];
  prefs: NotificationPrefs;
}) {
  const t = useT();
  const [device, setDevice] = useState<DeviceState>("checking");
  const [devices, setDevices] = useState(endpoints);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: DeviceState;
      if (!supported()) next = isIosBrowserTab() ? "needs_install" : "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        next = sub && endpoints.includes(sub.endpoint) ? "on" : "off";
      }
      if (!cancelled) setDevice(next);
    })().catch(() => !cancelled && setDevice("off"));
    return () => {
      cancelled = true;
    };
  }, [endpoints]);

  function fail(e: unknown, fallback: string) {
    toast.error(e instanceof ApiClientError ? e.message : fallback);
  }

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const saved = await apiRequest<{ endpoints: string[] }>(
        "/api/v1/me/notifications/subscription",
        { method: "PUT", body: sub.toJSON() },
      );
      setDevices(saved.endpoints);
      setDevice("on");
      toast.success(t("notifications.card.turnedOn"));
    } catch (e) {
      fail(e, t("notifications.card.turnOnFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const saved = await apiRequest<{ endpoints: string[] }>(
          "/api/v1/me/notifications/subscription",
          { method: "DELETE", body: { endpoint: sub.endpoint } },
        );
        setDevices(saved.endpoints);
        await sub.unsubscribe();
      }
      setDevice("off");
      toast.success(t("notifications.card.turnedOff"));
    } catch (e) {
      fail(e, t("notifications.card.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await apiRequest("/api/v1/me/notifications/test", { method: "POST" });
      toast.success(t("notifications.card.testSent"));
    } catch (e) {
      fail(e, t("notifications.card.testFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function setKind(kind: NotificationKind, on: boolean) {
    const next = { ...prefs, [kind]: on };
    setPrefs(next);
    try {
      await apiRequest("/api/v1/me/notifications/preferences", { method: "PUT", body: next });
    } catch (e) {
      setPrefs(prefs);
      fail(e, t("notifications.card.saveFailed"));
    }
  }

  const note = !publicKey
    ? t("notifications.card.unavailable")
    : device === "unsupported"
      ? t("notifications.card.unsupported")
      : device === "needs_install"
        ? t("notifications.card.needsInstall")
        : device === "blocked"
          ? t("notifications.card.blocked")
          : null;

  return (
    <section
      id="notifications"
      className="panel space-y-4 p-5"
      aria-labelledby="notifications-title"
    >
      <div className="space-y-1">
        <h2 id="notifications-title" className="text-lg font-semibold">
          {t("notifications.card.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("notifications.card.description")}</p>
      </div>

      {note ? (
        <p className="text-sm text-muted-foreground" role="status">
          {note}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {device === "on" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={busy}
                onClick={turnOff}
              >
                <BellOff aria-hidden className="size-4" /> {t("notifications.card.turnOff")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                disabled={busy}
                onClick={sendTest}
              >
                <Send aria-hidden className="size-4" /> {t("notifications.card.test")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="gap-2"
              disabled={busy || device === "checking"}
              onClick={turnOn}
            >
              <Bell aria-hidden className="size-4" /> {t("notifications.card.turnOn")}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {device === "on"
              ? t("notifications.card.thisDeviceOn")
              : devices.length > 0
                ? plural(t, "notifications.card.otherDevices", devices.length)
                : null}
          </span>
        </div>
      )}

      {publicKey && devices.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("notifications.card.kindsTitle")}</legend>
          {NOTIFICATION_KINDS.map((kind) => (
            <label key={kind} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs[kind]}
                onChange={(e) => setKind(kind, e.target.checked)}
                className="mt-1 accent-[var(--gold)]"
              />
              <span>
                {t(`notifications.kinds.${kind}.label`)}
                <span className="block text-xs text-muted-foreground">
                  {t(`notifications.kinds.${kind}.help`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}
