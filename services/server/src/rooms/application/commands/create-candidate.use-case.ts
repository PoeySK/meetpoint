import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ParticipantRole,
  ParticipantStatus,
} from '../../domain/participant/participant';
import {
  CandidateStatus,
  type CandidateRecord,
} from '../../domain/candidate/candidate';
import { RoomStatus } from '../../domain/room/room-status';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import {
  isDuplicateCandidate,
  validateCandidateInput,
} from './input-validation';
import { isRoomEditable } from '../../domain/room/room-state';
import { markLatestScoreResultStale } from '../room-score-state';

const MAX_ACTIVE_CANDIDATES = 5;

@Injectable()
export class CreateCandidateUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(
    roomId: string,
    accessToken: string | undefined,
    input: unknown
  ) {
    const actor = await this.access.authorize(roomId, accessToken);
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const normalizedInput = validateCandidateInput(input);
    const created = await this.persistence.transaction(async (repositories) => {
      const { rooms, candidates, participants } = repositories;
      const room = await rooms.findById(roomId, { lock: true });
      if (!room) {
        throw new NotFoundException('RESOURCE_NOT_FOUND');
      }
      if (!isRoomEditable(room)) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      const activeCandidates = await candidates.findByRoomId(room.id, {
        activeOnly: true,
      });
      if (activeCandidates.length >= MAX_ACTIVE_CANDIDATES) {
        throw new UnprocessableEntityException('CANDIDATE_LIMIT_EXCEEDED');
      }
      if (
        activeCandidates.some((candidate) =>
          isDuplicateCandidate(candidate, normalizedInput)
        )
      ) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      await markLatestScoreResultStale(repositories, room);

      const now = new Date();
      const updatedRoom =
        room.status === RoomStatus.DRAFT ||
        room.status === RoomStatus.CALCULATED
          ? { ...room, status: RoomStatus.OPEN, updatedAt: now }
          : room;
      if (updatedRoom !== room) {
        await rooms.save(updatedRoom);
      }

      const candidate: CandidateRecord = {
        id: randomUUID(),
        roomId: room.id,
        displayOrder: normalizedInput.displayOrder,
        time: normalizedInput.time,
        place: normalizedInput.place,
        estimatedCostPerPersonKrw: normalizedInput.estimatedCostPerPersonKrw,
        tags: normalizedInput.tags,
        status: CandidateStatus.ACTIVE,
        version: 1,
        archivedAt: null,
        createdByParticipantId: actor.participant.id,
        createdAt: now,
        updatedAt: now,
      };
      const savedCandidate = await candidates.save(candidate);
      const activeParticipants = await participants.findByRoomId(room.id);
      for (const participant of activeParticipants) {
        if (participant.status === ParticipantStatus.RESPONDED) {
          await participants.save({
            ...participant,
            status: ParticipantStatus.JOINED,
            updatedAt: now,
          });
        }
      }
      return savedCandidate;
    });

    return { candidate: created };
  }
}
