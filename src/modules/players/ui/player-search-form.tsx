import { getT } from "@/common/i18n/server";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/search-input";

/**
 * Plain GET form: works without JavaScript and keeps searches shareable (?q=).
 * `inline` drops the panel chrome so it can sit inside another layout (the home hero).
 */
export async function PlayerSearchForm({
  defaultValue,
  variant = "panel",
  label,
}: {
  defaultValue?: string;
  variant?: "panel" | "inline";
  /** Overrides the default "Find a player" label. */
  label?: string;
}) {
  const t = await getT();
  return (
    <form
      action="/players"
      method="get"
      role="search"
      className={variant === "panel" ? "panel space-y-3 p-4 sm:p-5" : "space-y-2"}
    >
      <label htmlFor="player-q" className="block text-sm font-medium">
        {label ?? t("players.searchForm.label")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput
          id="player-q"
          name="q"
          defaultValue={defaultValue}
          maxLength={200}
          autoComplete="off"
          placeholder={t("players.searchForm.placeholder")}
          aria-describedby="player-q-help"
          className="flex-1"
          inputClassName="h-10"
        />
        <Button
          type="submit"
          variant={variant === "panel" ? "default" : "outline"}
          className="h-10 px-5"
        >
          {t("players.searchForm.submit")}
        </Button>
      </div>
      <p id="player-q-help" className="text-xs text-muted-foreground">
        {t("players.searchForm.help")}
      </p>
    </form>
  );
}
