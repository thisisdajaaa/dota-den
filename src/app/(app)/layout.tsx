import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/composition";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/?auth_error=signed_out");
  return <>{children}</>;
}
