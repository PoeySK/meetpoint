import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Participant } from '../participants/entities/participant.entity';
import { Candidate } from './entities/candidate.entity';
import { Decision } from './entities/decision.entity';
import { ParticipantResponse } from './entities/participant-response.entity';
import { Room } from './entities/room.entity';
import { ScoreResult } from './entities/score-result.entity';
import { RoomsController } from './rooms.controller';
import { DecisionService } from './decision.service';
import { RoomsService } from './rooms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Room,
      Participant,
      Candidate,
      Decision,
      ParticipantResponse,
      ScoreResult,
    ]),
  ],
  controllers: [RoomsController],
  providers: [RoomsService, DecisionService],
  exports: [RoomsService],
})
export class RoomsModule {}
