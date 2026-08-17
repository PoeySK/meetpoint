import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import { RoomsErrorFilter } from './rooms-error.filter';
import { ParticipantLifecycleService } from './participant-lifecycle.service';
import { extractBearerToken } from './room-access';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class ParticipantLifecycleController {
  constructor(
    private readonly participantLifecycleService: ParticipantLifecycleService
  ) {}

  @Post(':roomId/leave')
  @HttpCode(HttpStatus.OK)
  leaveRoom(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined
  ) {
    return this.participantLifecycleService.leaveRoom(
      roomId,
      extractBearerToken(authorization)
    );
  }

  @Post(':roomId/participants/:participantId/kick')
  @HttpCode(HttpStatus.OK)
  kickParticipant(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @Headers('authorization') authorization: string | undefined
  ) {
    return this.participantLifecycleService.kickParticipant(
      roomId,
      participantId,
      extractBearerToken(authorization)
    );
  }
}
