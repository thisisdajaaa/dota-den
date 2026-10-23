/** Consistent page title block: kicker, display title, description, optional actions. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1.5">
        <p className="kicker">{kicker}</p>
        <h1 className="font-display text-3xl font-bold tracking-wide break-words sm:text-4xl">
          {title}
        </h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {/* Under the title up to tablets; beside it on wide screens, wrapping instead of pushing past the edge. */}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:max-w-[55%] lg:shrink-0 lg:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}
