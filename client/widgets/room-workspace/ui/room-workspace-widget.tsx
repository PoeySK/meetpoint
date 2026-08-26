import { CandidateManagementPanel } from "@/features/candidate-management";
import { CalculationResultPanel } from "@/features/calculation";
import { ParticipantResponsePanel } from "@/features/participant-response";
import { ParticipantConditionPanel } from "@/features/participant-condition";
import type { Candidate } from "@/entities/candidate";
import type { CalculationPayload } from "@/entities/calculation";
import type { DecisionPayload } from "@/entities/decision";
import type { RoomDetailsResponse } from "@/entities/room";

type RoomWorkspaceWidgetProps = {
  roomId: string;
  token: string;
  participantId: string;
  room: RoomDetailsResponse;
  onRoomReload: () => Promise<void>;
  onRoomRefresh: () => Promise<void>;
  onCandidateCreated: (candidate: Candidate) => void;
  latestScoreResult: CalculationPayload | null;
  decision: DecisionPayload | null;
};

export function RoomWorkspaceWidget({
  roomId,
  token,
  participantId,
  room,
  onRoomReload,
  onRoomRefresh,
  onCandidateCreated,
  latestScoreResult,
  decision,
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
      <ParticipantConditionPanel
        condition={room.myCondition}
        isReadOnly={
          room.room.status === "CONFIRMED" || room.room.status === "CLOSED"
        }
        onRoomRefresh={onRoomRefresh}
        participantId={participantId}
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
        hasCondition={room.myCondition !== null}
        roomId={roomId}
        token={token}
        onRoomRefresh={onRoomRefresh}
      />
      <CalculationResultPanel
        decision={decision}
        latestScoreResult={latestScoreResult}
        onRoomReload={onRoomReload}
        participantId={participantId}
        room={room}
        roomId={roomId}
        token={token}
      />
    </>
  );
}
