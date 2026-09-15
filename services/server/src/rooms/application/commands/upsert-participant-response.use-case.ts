import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CandidateStatus } from '../../domain/candidate/candidate';
import {
  ParticipantResponseStatus,
  type ParticipantResponseRecord,
} from '../../domain/participant-response/participant-response';
import { ParticipantStatus } from '../../domain/participant/participant';
import { RoomStatus } from '../../domain/room/room-status';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import { isRoomEditable } from '../../domain/room/room-state';
import { markLatestScoreResultStale } from '../room-score-state';
import { validateParticipantResponseInput } from './input-validation';
import { resolveParticipantStatus } from './participant-status';

@Injectable()
export class UpsertParticipantResponseUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(
    roomId: string,
    participantId: string,
    candidateId: string,
    accessToken: string | undefined,
    input: unknown
  ) {
    const actor = await this.access.authorize(roomId, accessToken);
    if (actor.participant.id !== participantId) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const normalizedInput = validateParticipantResponseInput(input);
    const saved = await this.persistence.transaction(async (repositories) => {
      const { rooms, participants, candidates, responses } = repositories;
      const room = await rooms.findById(roomId, { lock: true });
      if (!room) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }
      if (!isRoomEditable(room)) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      const candidate = await candidates.findById(candidateId);
      if (!candidate || candidate.roomId !== room.id) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }
      if (candidate.status === CandidateStatus.ARCHIVED) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      const participant = await participants.findById(participantId);
      if (!participant || participant.roomId !== room.id) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }
      if (
        participant.status !== ParticipantStatus.JOINED &&
        participant.status !== ParticipantStatus.RESPONDED
      ) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      await markLatestScoreResultStale(repositories, room);
      if (room.status === RoomStatus.CALCULATED) {
        await rooms.save({
          ...room,
          status: RoomStatus.OPEN,
          updatedAt: new Date(),
        });
      }

      const existing = await responses.findByParticipantAndCandidate(
        room.id,
        participantId,
        candidateId
      );
      const now = new Date();
      const response: ParticipantResponseRecord = existing ?? {
        id: randomUUID(),
        roomId: room.id,
        participantId,
        candidateId,
        availabilityStatus: normalizedInput.availabilityStatus,
        travelBurden: normalizedInput.travelBurden,
        note: normalizedInput.note,
        status: ParticipantResponseStatus.SUBMITTED,
        submittedAt: now,
        updatedAt: now,
      };

      response.availabilityStatus = normalizedInput.availabilityStatus;
      response.travelBurden = normalizedInput.travelBurden;
      response.note = normalizedInput.note;
      response.status = ParticipantResponseStatus.SUBMITTED;
      response.updatedAt = now;
      const savedResponse = await responses.save(response);
      const activeCandidates = await candidates.findByRoomId(room.id, {
        activeOnly: true,
      });
      const roomResponses = await responses.findByRoomId(room.id);
      const participantStatus = resolveParticipantStatus(
        participantId,
        activeCandidates,
        roomResponses
      );
      if (participant.status !== participantStatus) {
        await participants.save({
          ...participant,
          status: participantStatus,
          updatedAt: now,
        });
      }
      return {
        response: savedResponse,
        participantStatus,
      };
    });

    return { ...saved, scoreResultStatus: 'STALE' as const };
  }
}
