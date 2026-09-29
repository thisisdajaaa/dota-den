import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Plain GET form: works without JavaScript and keeps searches shareable (?q=). */
export function PlayerSearchForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/players" method="get" role="search" className="panel space-y-3 p-4 sm:p-5">
      <label htmlFor="player-q" className="block text-sm font-medium">
        Find a player
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="player-q"
            name="q"
            type="search"
            defaultValue={defaultValue}
            maxLength={200}
            autoComplete="off"
            placeholder="Name, account ID or profile link"
            aria-describedby="player-q-help"
            className="h-10 pl-9"
          />
        </div>
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
