import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { JoinParticipantDto } from './dto/join-participant.dto';
import { RoomsService } from './rooms.service';

@Controller('api/v1/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  createRoom(@Body() body: CreateRoomDto) {
    return this.roomsService.createRoom(body);
  }

  @Post(':roomCode/participants')
  joinParticipant(
    @Param('roomCode') roomCode: string,
    @Body() body: JoinParticipantDto
  ) {
    return this.roomsService.joinParticipant(roomCode, body);
  }

  @Get(':roomId')
  getRoom(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.roomsService.getRoom(
      roomId,
      this.extractBearerToken(authorization)
    );
  }

  private extractBearerToken(authorization?: string): string | undefined {
    if (!authorization) {
      return undefined;
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }
    return token;
  }
}
