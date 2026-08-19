import { ParticipantJoinForm } from "@/features/participant-join";

type ParticipantJoinWidgetProps = {
  initialRoomCode?: string;
};

export function ParticipantJoinWidget({
  initialRoomCode,
}: ParticipantJoinWidgetProps) {
  return <ParticipantJoinForm initialRoomCode={initialRoomCode} />;
}
