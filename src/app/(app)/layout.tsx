import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { REQUEST_PATH_HEADER } from "@/common/http/request-path";
import { getCurrentUser, usersService } from "@/modules/identity";
import { safeReturnPath } from "@/modules/identity/domain/return-path";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    // Send them back to the page they asked for once they've signed in.
    const next = safeReturnPath((await headers()).get(REQUEST_PATH_HEADER));
    redirect(
      next ? `/?auth_error=signed_out&next=${encodeURIComponent(next)}` : "/?auth_error=signed_out",
    );
  }
  // For the admin page's retention numbers: one write per player per day, after the response.
  after(() => usersService.recordVisit(user.id));
  return <>{children}</>;
}
