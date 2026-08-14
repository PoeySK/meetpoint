import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UseFilters,
} from '@nestjs/common';
import type { CreateCandidateDto } from './dto/create-candidate.dto';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { JoinParticipantDto } from './dto/join-participant.dto';
import type { UpsertParticipantResponseDto } from './dto/upsert-participant-response.dto';
import { RoomsErrorFilter } from './rooms-error.filter';
import { RoomsService } from './rooms.service';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
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

  @Post(':roomId/candidates')
  createCandidate(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateCandidateDto
  ) {
    return this.roomsService.createCandidate(
      roomId,
      this.extractBearerToken(authorization),
      body
    );
  }

  @Put(':roomId/participants/:participantId/responses/:candidateId')
  upsertParticipantResponse(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @Param('candidateId') candidateId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpsertParticipantResponseDto
  ) {
    return this.roomsService.upsertParticipantResponse(
      roomId,
      participantId,
      candidateId,
      this.extractBearerToken(authorization),
      body
    );
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
