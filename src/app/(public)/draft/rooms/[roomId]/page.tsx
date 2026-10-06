import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import {
  getDraftHeroes,
  getDraftRoomEvents,
  getDraftRoomService,
} from "@/modules/drafts/composition";
import { eventView, roomView } from "@/modules/drafts/room-http";
import { RoomClient, RoomNotAvailable } from "@/modules/drafts/ui/room-client";
import { getCurrentUser } from "@/modules/identity";

export const metadata: Metadata = { title: "Draft room" };

const ROOM_ID = /^[A-Za-z0-9]{10}$/;

export default async function DraftRoomPage({ params }: PageProps<"/draft/rooms/[roomId]">) {
  const { roomId } = await params;
  const header = <PageHeader kicker="Draft room" title="Live draft" />;
  if (!ROOM_ID.test(roomId)) {
    return (
      <div className="space-y-6">
        {header}
        <RoomNotAvailable />
      </div>
    );
  }
  const [room, heroes, user] = await Promise.all([
    (await getDraftRoomService()).get(roomId),
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
  const events = await getDraftRoomEvents(roomId, 0);
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
