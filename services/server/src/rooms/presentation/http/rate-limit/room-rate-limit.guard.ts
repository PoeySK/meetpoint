import {
  applyDecorators,
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ROOM_ACCESS,
  type RoomAccessPort,
} from '../../../application/ports/room-access.port';
import { ParticipantRole } from '../../../domain/participant/participant';
import { normalizeIp } from '../../../../config/trusted-proxy';
import { extractBearerToken } from '../auth/bearer-token';
import { assertRecoveryOrigin } from '../auth/recovery-cookie';
import { ROOM_LIMITS, RoomRateLimiter } from './room-rate-limiter';

type Policy =
  | 'create'
  | 'join'
  | 'recover'
  | 'register'
  | 'condition'
  | 'response'
  | 'calculation';
const POLICY = 'room-rate-limit';

export function RateLimited(policy: Policy) {
  return applyDecorators(
    SetMetadata(POLICY, policy),
    UseGuards(RoomRateLimitGuard)
  );
}

@Injectable()
export class RoomRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RoomRateLimiter,
    @Inject(ROOM_ACCESS) private readonly access: RoomAccessPort
  ) {}

  async canActivate(context: ExecutionContext) {
    const policy = this.reflector.get<Policy>(POLICY, context.getHandler());
    const request = context.switchToHttp().getRequest<Request>();
    const ip = normalizeIp(request.ip ?? request.socket.remoteAddress ?? '');
    const ipLimit =
      policy === 'create'
        ? ROOM_LIMITS.create
        : policy === 'join'
          ? ROOM_LIMITS.join
          : policy === 'recover' || policy === 'register'
            ? ROOM_LIMITS.recovery
            : policy === 'calculation'
              ? ROOM_LIMITS.calculationIp
              : ROOM_LIMITS.writes;
    this.limiter.consume(ipLimit, [ip]);
    if (policy === 'create' || policy === 'join' || policy === 'recover')
      return true;

    const roomId = String(request.params.roomId);
    if (policy === 'register') {
      assertRecoveryOrigin(request.get('origin'));
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          roomId
        )
      )
        throw new BadRequestException('VALIDATION_ERROR');
    }
    const actor = await this.access
      .authorize(roomId, extractBearerToken(request.get('authorization')))
      .catch((error: unknown) => {
        if (policy === 'register' && error instanceof UnauthorizedException)
          throw new UnauthorizedException('INVALID_TOKEN');
        throw error;
      });
    if (policy === 'calculation') {
      if (actor.participant.role !== ParticipantRole.HOST)
        throw new ForbiddenException('HOST_ONLY');
      this.limiter.consume(ROOM_LIMITS.calculation, [actor.room.id]);
    } else {
      if (
        policy !== 'register' &&
        actor.participant.id !== request.params.participantId
      )
        throw new ForbiddenException('FORBIDDEN');
      this.limiter.consume(ROOM_LIMITS[policy], [
        actor.room.id,
        actor.participant.id,
      ]);
    }
    return true;
  }
}
