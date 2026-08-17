import ParticipantJoinScreen from "@/features/participant-join/ui/participant-join-screen";

type ParticipantJoinPageProps = {
  initialRoomCode?: string;
};

export default function ParticipantJoinPage({
  initialRoomCode,
}: ParticipantJoinPageProps) {
  return <ParticipantJoinScreen initialRoomCode={initialRoomCode} />;
}
