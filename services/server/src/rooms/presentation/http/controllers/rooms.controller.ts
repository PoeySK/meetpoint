import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimited } from '../rate-limit/room-rate-limit.guard';
import { RecoverRoomAccessUseCase } from '../../../application/commands/recover-room-access.use-case';
import {
  assertRecoveryOrigin,
  readRecoveryCookie,
  setRecoveryCookie,
} from '../auth/recovery-cookie';
import type { CreateRoomDto } from '../dto/create-room.dto';
import type { JoinParticipantDto } from '../dto/join-participant.dto';
import { extractBearerToken } from '../auth/bearer-token';
import { RoomsErrorFilter } from '../filters/rooms-error.filter';
import { CreateRoomUseCase } from '../../../application/commands/create-room.use-case';
import { JoinParticipantUseCase } from '../../../application/commands/join-participant.use-case';
import { GetRoomQuery } from '../../../application/queries/get-room.query';
import {
  toCreatedRoomResponse,
  toJoinedParticipantResponse,
  toRoomDetailsResponse,
  toPublicParticipant,
  createRequestId,
} from '../view-models/room-response';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class RoomsController {
  constructor(
    private readonly createRoomUseCase: CreateRoomUseCase,
    private readonly joinParticipantUseCase: JoinParticipantUseCase,
    private readonly getRoomQuery: GetRoomQuery,
    private readonly recoverRoomAccess: RecoverRoomAccessUseCase
  ) {}

  @Post()
  @RateLimited('create')
  async createRoom(
    @Body() body: CreateRoomDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.createRoomUseCase.execute(body);
    setRecoveryCookie(
      response,
      result.room.id,
      result.recovery.code,
      result.recovery.expiresAt
    );
    return toCreatedRoomResponse(result);
  }

  @Post(':roomCode/participants')
  @RateLimited('join')
  async joinParticipant(
    @Param('roomCode') roomCode: string,
    @Body() body: JoinParticipantDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.joinParticipantUseCase.execute(roomCode, body);
    setRecoveryCookie(
      response,
      result.room.id,
      result.recovery.code,
      result.recovery.expiresAt
    );
    return toJoinedParticipantResponse(result);
  }

  @Post(':roomId/recovery')
  @RateLimited('recover')
  async recover(
    @Param('roomId') roomId: string,
    @Body() body: { recoveryCode?: unknown },
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    assertRecoveryOrigin(origin, !body?.recoveryCode);
    const code = body?.recoveryCode ?? readRecoveryCookie(roomId, cookie);
    const result = await this.recoverRoomAccess.execute(roomId, code);
    setRecoveryCookie(
      response,
      roomId,
      code as string,
      result.recoveryExpiresAt
    );
    return {
      requestId: createRequestId(),
      participant: toPublicParticipant(result.participant),
      access: { participantToken: result.accessToken },
      recoveryExpiresAt: result.recoveryExpiresAt,
    };
  }

  @Post(':roomId/recovery/register')
  @RateLimited('register')
  async registerRecovery(
    @Param('roomId') roomId: string,
    @Body() body: { replace?: unknown },
    @Headers('authorization') authorization: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    assertRecoveryOrigin(origin);
    const result = await this.recoverRoomAccess.register(
      roomId,
      extractBearerToken(authorization),
      body?.replace
    );
    response.setHeader('Cache-Control', 'no-store');
    if (result.code)
      setRecoveryCookie(response, roomId, result.code, result.expiresAt);
    return { requestId: createRequestId(), recovery: result };
  }

  @Get(':roomId')
  getRoom(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.getRoomQuery
      .execute(roomId, extractBearerToken(authorization))
      .then(toRoomDetailsResponse);
  }
}
