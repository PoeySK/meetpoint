import type { Participant } from '../../participants/entities/participant.entity';
import type { Candidate } from '../entities/candidate.entity';
import type { ParticipantResponse } from '../entities/participant-response.entity';
import type { ScoreResultCoverage } from '../entities/score-result.entity';
import type { Room } from '../entities/room.entity';
import {
  isCandidateResponseForSnapshot,
  type SolverSnapshot,
} from './solver-types';

export function createSolverSnapshot(
  requestId: string,
  room: Room,
  participants: Participant[],
  candidates: Candidate[],
  responses: ParticipantResponse[],
  policyVersion: string,
  scoringProfile: string
): SolverSnapshot {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  return {
    requestId,
    policyVersion,
    scoringProfile,
    roomId: room.id,
    participants: participants.map((participant) => ({
      participantId: participant.id,
      responses: responses
        .filter((response) =>
          isCandidateResponseForSnapshot(response, participant.id, candidateIds)
        )
        .map((response) => ({
          candidateId: response.candidateId,
          availabilityStatus: response.availabilityStatus,
          travelBurden: response.travelBurden,
          note: response.note,
        })),
    })),
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.id,
      displayOrder: candidate.displayOrder,
      time: candidate.time,
      place: candidate.place,
      estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
      tags: [...candidate.tags],
    })),
  };
}

export function createInitialCoverage(
  snapshot: SolverSnapshot
): ScoreResultCoverage {
  const submittedResponses = snapshot.participants.reduce(
    (count, participant) => count + participant.responses.length,
    0
  );

  return {
    respondedParticipants: snapshot.participants.filter(
      (participant) => participant.responses.length > 0
    ).length,
    totalParticipants: snapshot.participants.length,
    submittedResponses,
    expectedResponses:
      snapshot.participants.length * snapshot.candidates.length,
  };
}
