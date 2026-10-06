import type { Metadata } from "next";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { draftRoomService, getDraftHeroes } from "@/modules/drafts";
import { eventView, roomView } from "@/modules/drafts/dtos/responses/room-views.dto";
import { RoomClient, RoomNotAvailable } from "@/modules/drafts/ui/room-client";
import { getCurrentUser } from "@/modules/identity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("drafts.roomPage.metaTitle") };
}

const ROOM_ID = /^[A-Za-z0-9]{10}$/;

export default async function DraftRoomPage({ params }: PageProps<"/draft/rooms/[roomId]">) {
  const { roomId } = await params;
  const t = await getT();
  const header = (
    <PageHeader kicker={t("drafts.roomPage.kicker")} title={t("drafts.roomPage.title")} />
  );
  if (!ROOM_ID.test(roomId)) {
    return (
      <div className="space-y-6">
        {header}
        <RoomNotAvailable />
      </div>
    );
  }
  const [room, heroes, user] = await Promise.all([
    draftRoomService.get(roomId),
    getDraftHeroes(),
    getCurrentUser({ tolerateErrors: true }),
  ]);
  if (!room.ok || heroes.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <RoomNotAvailable />
      </div>
    );
  }
  const events = await draftRoomService.events(roomId, 0);
  return (
    <div className="space-y-6">
      {header}
      <RoomClient
        initialRoom={roomView(room.value, user?.id ?? null)}
        initialEvents={events.map(eventView)}
        heroes={heroes}
      />
    </div>
  );
}
