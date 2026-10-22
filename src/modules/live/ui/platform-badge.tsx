import { cn } from "cn";
import { PLATFORM_NAMES, type Platform } from "../domain/platform";

const STYLES: Record<Platform, string> = {
  twitch: "bg-[#9146ff]/25 text-[#cdb4ff] ring-[#9146ff]/40",
  kick: "bg-[#53fc18]/15 text-[#8dff66] ring-[#53fc18]/35",
};

/** Which site a stream or channel is on. */
export function PlatformBadge({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-px text-[0.6rem] font-bold tracking-wider uppercase ring-1",
        STYLES[platform],
        className,
      )}
    >
      {PLATFORM_NAMES[platform]}
    </span>
  );
}
