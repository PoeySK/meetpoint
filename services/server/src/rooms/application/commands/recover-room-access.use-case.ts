import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ACCESS_TOKEN, type AccessTokenPort } from '../ports/room-access.port';
import {
  RECOVERY_CREDENTIAL,
  type RecoveryCredentialPort,
} from '../ports/recovery-credential.port';
import {
  ROOMS_PERSISTENCE,
  type RoomsPersistencePort,
} from '../ports/rooms-persistence.port';
import { isActiveParticipant } from '../../domain/participant/participant';

@Injectable()
export class RecoverRoomAccessUseCase {
  constructor(
    @Inject(ROOMS_PERSISTENCE)
    private readonly persistence: RoomsPersistencePort,
    @Inject(ACCESS_TOKEN) private readonly accessToken: AccessTokenPort,
    @Inject(RECOVERY_CREDENTIAL)
    private readonly recovery: RecoveryCredentialPort
  ) {}

  async execute(roomId: string, code: unknown) {
    this.validateRoomId(roomId);
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
      throw new UnauthorizedException('RECOVERY_UNAVAILABLE');
    }
    return this.persistence.transaction(async ({ rooms, participants }) => {
      const room = await rooms.findById(roomId, { lock: true });
      const participant =
        room &&
        (await participants.findByRoomId(room.id)).find(
          (candidate) => candidate.recoveryHash === this.recovery.hash(code)
        );
      if (
        !participant ||
        !isActiveParticipant(participant) ||
        participant.tokenRevokedAt ||
        !participant.recoveryExpiresAt ||
        participant.recoveryExpiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('RECOVERY_UNAVAILABLE');
      }
      const issued = this.accessToken.issue();
      const saved = await participants.save({
        ...participant,
        tokenHash: issued.tokenHash,
        tokenExpiresAt: issued.tokenExpiresAt,
        updatedAt: new Date(),
      });
      return {
        participant: saved,
        accessToken: issued.token,
        recoveryExpiresAt: participant.recoveryExpiresAt,
      };
    });
  }

  async register(roomId: string, token: string | undefined, replace: unknown) {
    this.validateRoomId(roomId);
    if (replace !== undefined && typeof replace !== 'boolean') {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    return this.persistence.transaction(async ({ rooms, participants }) => {
      const room = await rooms.findById(roomId, { lock: true });
      const participant =
        token &&
        room &&
        (await participants.findByTokenHash(this.accessToken.hash(token)));
      if (
        !participant ||
        participant.roomId !== roomId ||
        !isActiveParticipant(participant) ||
        participant.tokenRevokedAt ||
        participant.tokenExpiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('INVALID_TOKEN');
      }
      if (
        !replace &&
        participant.recoveryHash &&
        participant.recoveryExpiresAt &&
        participant.recoveryExpiresAt.getTime() > Date.now()
      ) {
        return { code: null, expiresAt: participant.recoveryExpiresAt };
      }
      const issued = this.recovery.issue();
      await participants.save({
        ...participant,
        recoveryHash: issued.hash,
        recoveryExpiresAt: issued.expiresAt,
        updatedAt: new Date(),
      });
      return { code: issued.code, expiresAt: issued.expiresAt };
    });
  }

  private validateRoomId(roomId: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        roomId
      )
    ) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
  }
}
