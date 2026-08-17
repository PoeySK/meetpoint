/**
 * Backward-compatible import for callers that still use the old plural name.
 * New HTTP adapters should depend on the feature-specific services directly.
 */
export { RoomService as RoomsService } from './room.service';

export type {
  CalculationPayload,
  CalculationResponse,
  CalculationSummary,
  CreatedCandidateResponse,
  CreatedRoomResponse,
  JoinedParticipantResponse,
  LatestScoreResultResponse,
  ParticipantResponsePayload,
  PublicParticipant,
  RoomDetailsResponse,
  RoomPayload,
  StartCalculationResponse,
  UpsertedParticipantResponse,
  ParticipantLifecycleResponse,
} from './room-response';
