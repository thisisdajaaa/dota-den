import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/modules/identity/composition";

export async function SiteHeader() {
  const user = await getCurrentUser({ tolerateErrors: true });

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Dota Den
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4 text-sm text-muted-foreground">
          {user && (
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
          )}
        </nav>
        <div className="ml-auto">
          {user ? (
            <form action="/api/v1/auth/sign-out" method="post">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          ) : (
            <Button asChild size="sm">
              {/* Full navigation, not client-side: the route redirects to Steam. */}
              <a href="/api/v1/auth/steam/login">Sign in through Steam</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
