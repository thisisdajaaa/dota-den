import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentUser, usersService } from "@/modules/identity";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/?auth_error=signed_out");
  // For the admin page's retention numbers: one write per player per day, after the response.
  after(() => usersService.recordVisit(user.id));
  return <>{children}</>;
}
