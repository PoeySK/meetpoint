import ParticipantJoinPage from "@/pages/participant-join/ui/participant-join-page";

type JoinPageProps = {
  params: Promise<{
    roomCode: string;
  }>;
};

export default async function JoinRoomPage({ params }: JoinPageProps) {
  const { roomCode } = await params;

  return <ParticipantJoinPage initialRoomCode={roomCode} />;
}
