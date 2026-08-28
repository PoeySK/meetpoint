import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CandidateStatus } from '../../domain/candidate/candidate';
import { ParticipantRole } from '../../domain/participant/participant';
import { ROOM_ACCESS, type RoomAccessPort } from '../ports/room-access.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import {
  isDuplicateCandidate,
  validateCandidateUpdateInput,
} from './input-validation';
import { isRoomEditable } from '../../domain/room/room-state';
import { markLatestScoreResultStale } from '../room-score-state';
import {
  reconcileParticipantStatusesAfterCandidateChange,
  reopenRoomAfterCandidateChange,
} from './candidate-lifecycle';

@Injectable()
export class UpdateCandidateUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async execute(
    roomId: string,
    candidateId: string,
    accessToken: string | undefined,
    expectedVersion: number,
    input: unknown
  ) {
    const actor = await this.access.authorize(roomId, accessToken);
    if (actor.participant.role !== ParticipantRole.HOST) {
      throw new ForbiddenException('HOST_ONLY');
    }

    const updated = await this.persistence.transaction(async (repositories) => {
      const { rooms, candidates } = repositories;
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
      if (candidate.status !== CandidateStatus.ACTIVE) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }
      if (candidate.version !== expectedVersion) {
        throw new ConflictException('CANDIDATE_VERSION_CONFLICT');
      }

      const normalizedInput = validateCandidateUpdateInput(input, candidate);
      const activeCandidates = await candidates.findByRoomId(room.id, {
        activeOnly: true,
      });
      if (
        activeCandidates.some(
          (activeCandidate) =>
            activeCandidate.id !== candidate.id &&
            isDuplicateCandidate(activeCandidate, normalizedInput)
        )
      ) {
        throw new ConflictException('ROOM_STATE_CONFLICT');
      }

      const now = new Date();
      await markLatestScoreResultStale(repositories, room);

      const nextCandidate = {
        ...candidate,
        ...normalizedInput,
        version: expectedVersion + 1,
        updatedAt: now,
      };
      const savedCandidate = await candidates.saveIfVersion(
        nextCandidate,
        expectedVersion
      );
      if (!savedCandidate) {
        throw new ConflictException('CANDIDATE_VERSION_CONFLICT');
      }

      const activeCandidatesAfterUpdate = activeCandidates.map((item) =>
        item.id === savedCandidate.id ? savedCandidate : item
      );
      await reconcileParticipantStatusesAfterCandidateChange(
        repositories,
        room.id,
        activeCandidatesAfterUpdate,
        now
      );
      await rooms.save(reopenRoomAfterCandidateChange(room, now));

      return savedCandidate;
    });

    return { candidate: updated, scoreResultStatus: 'STALE' as const };
  }
}
