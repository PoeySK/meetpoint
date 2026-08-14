import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Participant } from '../participants/entities/participant.entity';
import { Candidate } from './entities/candidate.entity';
import { ParticipantResponse } from './entities/participant-response.entity';
import { Room } from './entities/room.entity';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Room,
      Participant,
      Candidate,
      ParticipantResponse,
    ]),
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
