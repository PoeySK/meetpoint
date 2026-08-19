import { RoomWidget } from "@/widgets/room";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  return <RoomWidget roomId={roomId} />;
}
