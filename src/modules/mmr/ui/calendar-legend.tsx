export function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-win/60" aria-hidden /> MMR gained
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-loss/60" aria-hidden /> MMR lost
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm border border-foreground/60" aria-hidden />
        <span>
          <span className="font-medium text-foreground">+50</span> exact, from your entries
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm border border-dashed border-foreground/40" aria-hidden />
        <span>
          <span className="font-medium text-foreground">≈ +25</span> estimate: ±25 per ranked win or
          loss
        </span>
      </span>
    </div>
  );
}
