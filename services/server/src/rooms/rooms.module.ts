import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Participant } from '../participants/entities/participant.entity';
import { Candidate } from './entities/candidate.entity';
import { Decision } from './entities/decision.entity';
import { ParticipantResponse } from './entities/participant-response.entity';
import { Room } from './entities/room.entity';
import { ScoreResult } from './entities/score-result.entity';
import { CandidateController } from './candidate.controller';
import { CandidateService } from './candidate.service';
import { CalculationController } from './calculation.controller';
import { RoomCalculationService } from './calculation/room-calculation.service';
import { DecisionController } from './decision.controller';
import { RoomsController } from './rooms.controller';
import { ParticipantResponseController } from './participant-response.controller';
import { ParticipantResponseService } from './participant-response.service';
import { ParticipantLifecycleController } from './participant-lifecycle.controller';
import { ParticipantLifecycleService } from './participant-lifecycle.service';
import { DecisionService } from './decision.service';
import { RoomQueryService } from './room-query.service';
import { RoomService } from './room.service';

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
  controllers: [
    RoomsController,
    CandidateController,
    ParticipantResponseController,
    CalculationController,
    DecisionController,
    ParticipantLifecycleController,
  ],
  providers: [
    RoomService,
    RoomQueryService,
    CandidateService,
    ParticipantResponseService,
    RoomCalculationService,
    DecisionService,
    ParticipantLifecycleService,
  ],
  exports: [RoomService, RoomQueryService],
})
export class RoomsModule {}
