import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import { RoomsErrorFilter } from '../filters/rooms-error.filter';
import { LeaveRoomUseCase } from '../../../application/commands/leave-room.use-case';
import { KickParticipantUseCase } from '../../../application/commands/kick-participant.use-case';
import { extractBearerToken } from '../auth/bearer-token';
import { toParticipantLifecycleResponse } from '../view-models/room-response';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class ParticipantLifecycleController {
  constructor(
    private readonly leaveRoomUseCase: LeaveRoomUseCase,
    private readonly kickParticipantUseCase: KickParticipantUseCase
  ) {}

  @Post(':roomId/leave')
  @HttpCode(HttpStatus.OK)
  leaveRoom(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined
  ) {
    return this.leaveRoomUseCase
      .execute(roomId, extractBearerToken(authorization))
      .then(toParticipantLifecycleResponse);
  }

  @Post(':roomId/participants/:participantId/kick')
  @HttpCode(HttpStatus.OK)
  kickParticipant(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @Headers('authorization') authorization: string | undefined
  ) {
    return this.kickParticipantUseCase
      .execute(roomId, participantId, extractBearerToken(authorization))
      .then(toParticipantLifecycleResponse);
  }
}
