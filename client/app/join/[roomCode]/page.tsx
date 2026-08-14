import ParticipantJoinScreen from "@/features/participant-join/ui/participant-join-screen";

type JoinPageProps = {
  params: Promise<{
    roomCode: string;
  }>;
};

export default async function JoinRoomPage({ params }: JoinPageProps) {
  const { roomCode } = await params;

  return <ParticipantJoinScreen initialRoomCode={roomCode} />;
}
