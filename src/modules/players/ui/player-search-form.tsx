import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/search-input";

/** Plain GET form: works without JavaScript and keeps searches shareable (?q=). */
export function PlayerSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/players" method="get" role="search" className="panel space-y-3 p-4 sm:p-5">
      <label htmlFor="player-q" className="block text-sm font-medium">
        Find a player
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput
          id="player-q"
          name="q"
          defaultValue={defaultValue}
          maxLength={200}
          autoComplete="off"
          placeholder="Name, account ID or profile link"
          aria-describedby="player-q-help"
          className="flex-1"
          inputClassName="h-10"
        />
        <Button type="submit" className="h-10 px-5">
          Search
        </Button>
      </div>
      <p id="player-q-help" className="text-xs text-muted-foreground">
        Try a Steam name, a Dota account ID, or paste a Steam, Dotabuff or OpenDota profile link.
      </p>
    </form>
  );
}
