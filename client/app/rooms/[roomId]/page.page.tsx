import RoomWaitingScreen from "@/pages/room/ui/room-waiting-screen";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  return <RoomWaitingScreen roomId={roomId} />;
}
