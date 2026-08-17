import { CandidateManagementPanel } from "@/features/candidate-management/ui/candidate-management-panel";
import { CalculationResultPanel } from "@/features/calculation/ui/calculation-result-panel";
import { ParticipantResponsePanel } from "@/features/participant-response/ui/participant-response-panel";
import type { Candidate } from "@/entities/candidate/model/types";
import type { RoomDetailsResponse } from "@/entities/room/model/types";

type RoomWorkspaceWidgetProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
  onRoomReload: () => Promise<void>;
  onRoomRefresh: () => Promise<void>;
  onCandidateCreated: (candidate: Candidate) => void;
};

export function RoomWorkspaceWidget({
  roomId,
  token,
  participantId,
  room,
  onRoomReload,
  onRoomRefresh,
  onCandidateCreated,
}: RoomWorkspaceWidgetProps) {
  return (
    <>
      <CandidateManagementPanel
        onCandidateCreated={onCandidateCreated}
        participantId={participantId}
        room={room}
        roomId={roomId}
        token={token}
      />
      <ParticipantResponsePanel
        candidates={room.candidates}
        isReadOnly={
          room.room.status === "CONFIRMED" || room.room.status === "CLOSED"
        }
        participantId={participantId}
        responses={room.myResponses}
        roomId={roomId}
        token={token}
        onRoomRefresh={onRoomRefresh}
      />
      <CalculationResultPanel
        onRoomReload={onRoomReload}
        participantId={participantId}
        room={room}
        roomId={roomId}
        token={token}
      />
    </>
  );
}
