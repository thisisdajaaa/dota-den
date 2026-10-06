import { getT } from "@/common/i18n/server";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/search-input";

/** Plain GET form: works without JavaScript and keeps searches shareable (?q=). */
export async function PlayerSearchForm({ defaultValue }: { defaultValue?: string }) {
  const t = await getT();
  return (
    <form action="/players" method="get" role="search" className="panel space-y-3 p-4 sm:p-5">
      <label htmlFor="player-q" className="block text-sm font-medium">
        {t("players.searchForm.label")}
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
        <Button type="submit" className="h-10 px-5">
          {t("players.searchForm.submit")}
        </Button>
      </div>
      <p id="player-q-help" className="text-xs text-muted-foreground">
        {t("players.searchForm.help")}
      </p>
    </form>
  );
}
