import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function SessionsLoading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("sessions.page.loading")}>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-[28rem] rounded-2xl" />
    </div>
  );
}
