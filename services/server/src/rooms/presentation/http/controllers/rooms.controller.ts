import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
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
} from '../view-models/room-response';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class RoomsController {
  constructor(
    private readonly createRoomUseCase: CreateRoomUseCase,
    private readonly joinParticipantUseCase: JoinParticipantUseCase,
    private readonly getRoomQuery: GetRoomQuery
  ) {}

  @Post()
  async createRoom(@Body() body: CreateRoomDto) {
    return toCreatedRoomResponse(await this.createRoomUseCase.execute(body));
  }

  @Post(':roomCode/participants')
  joinParticipant(
    @Param('roomCode') roomCode: string,
    @Body() body: JoinParticipantDto
  ) {
    return this.joinParticipantUseCase
      .execute(roomCode, body)
      .then(toJoinedParticipantResponse);
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
