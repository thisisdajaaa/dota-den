import { BrandMark } from "./brand-mark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-start sm:px-6">
        <BrandMark className="size-6 shrink-0 opacity-60 grayscale" />
        <p className="max-w-3xl leading-relaxed">
          Dota Den is an unofficial fan project. It is not affiliated with or endorsed by Valve
          Corporation. Dota 2 is a registered trademark of Valve Corporation. Match data is provided
          by OpenDota where available; patch notes link to their official source.
        </p>
      </div>
    </footer>
  );
}
