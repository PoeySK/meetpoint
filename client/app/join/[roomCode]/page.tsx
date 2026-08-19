import { ParticipantJoinWidget } from "@/widgets/participant-join";

type JoinPageProps = {
  params: Promise<{
    roomCode: string;
  }>;
};

export default async function JoinRoomPage({ params }: JoinPageProps) {
  const { roomCode } = await params;

  return <ParticipantJoinWidget initialRoomCode={roomCode} />;
}
