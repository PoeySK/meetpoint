import { RoomWidget } from "@/widgets/room";
import { notFound } from "next/navigation";

type RoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(roomId)) {
    notFound();
  }

  return <RoomWidget roomId={roomId} />;
}
