import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { JoinParticipantDto } from './dto/join-participant.dto';
import { extractBearerToken } from './room-access';
import { RoomsErrorFilter } from './rooms-error.filter';
import { RoomQueryService } from './room-query.service';
import { RoomService } from './room.service';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class RoomsController {
  constructor(
    private readonly roomService: RoomService,
    private readonly roomQueryService: RoomQueryService
  ) {}

  @Post()
  createRoom(@Body() body: CreateRoomDto) {
    return this.roomService.createRoom(body);
  }

  @Post(':roomCode/participants')
  joinParticipant(
    @Param('roomCode') roomCode: string,
    @Body() body: JoinParticipantDto
  ) {
    return this.roomService.joinParticipant(roomCode, body);
  }

  @Get(':roomId')
  getRoom(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.roomQueryService.getRoom(
      roomId,
      extractBearerToken(authorization)
    );
  }
}
