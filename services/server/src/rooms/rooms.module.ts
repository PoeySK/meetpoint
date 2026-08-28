import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Participant } from './infrastructure/persistence/typeorm/entities/participant.entity';
import { Candidate } from './infrastructure/persistence/typeorm/entities/candidate.entity';
import { Decision } from './infrastructure/persistence/typeorm/entities/decision.entity';
import { ParticipantResponse } from './infrastructure/persistence/typeorm/entities/participant-response.entity';
import { ParticipantCondition } from './infrastructure/persistence/typeorm/entities/participant-condition.entity';
import { Room } from './infrastructure/persistence/typeorm/entities/room.entity';
import { ScoreResult } from './infrastructure/persistence/typeorm/entities/score-result.entity';
import { CandidateController } from './presentation/http/controllers/candidate.controller';
import { CalculationController } from './presentation/http/controllers/calculation.controller';
import { DecisionController } from './presentation/http/controllers/decision.controller';
import { RoomsController } from './presentation/http/controllers/rooms.controller';
import { ParticipantResponseController } from './presentation/http/controllers/participant-response.controller';
import { ParticipantConditionController } from './presentation/http/controllers/participant-condition.controller';
import { ParticipantLifecycleController } from './presentation/http/controllers/participant-lifecycle.controller';
import { CreateRoomUseCase } from './application/commands/create-room.use-case';
import { JoinParticipantUseCase } from './application/commands/join-participant.use-case';
import { CreateCandidateUseCase } from './application/commands/create-candidate.use-case';
import { UpdateCandidateUseCase } from './application/commands/update-candidate.use-case';
import { ArchiveCandidateUseCase } from './application/commands/archive-candidate.use-case';
import { UpsertParticipantResponseUseCase } from './application/commands/upsert-participant-response.use-case';
import { UpsertParticipantConditionUseCase } from './application/commands/upsert-participant-condition.use-case';
import { LeaveRoomUseCase } from './application/commands/leave-room.use-case';
import { KickParticipantUseCase } from './application/commands/kick-participant.use-case';
import { StartCalculationUseCase } from './application/commands/start-calculation.use-case';
import { ConfirmDecisionUseCase } from './application/commands/confirm-decision.use-case';
import { ReopenDecisionUseCase } from './application/commands/reopen-decision.use-case';
import { GetRoomQuery } from './application/queries/get-room.query';
import { GetCalculationQuery } from './application/queries/get-calculation.query';
import { GetLatestScoreResultQuery } from './application/queries/get-latest-score-result.query';
import { GetDecisionQuery } from './application/queries/get-decision.query';
import { TypeOrmRoomsPersistenceAdapter } from './infrastructure/persistence/typeorm/typeorm-rooms-persistence.adapter';
import { TypeOrmRoomAccessAdapter } from './infrastructure/persistence/typeorm/typeorm-room-access.adapter';
import { AccessTokenAdapter } from './infrastructure/security/access-token.adapter';
import { SolverAdapter } from './infrastructure/solver/solver.adapter';
import { SolverHttpClient } from './infrastructure/solver/solver-http-client';
import {
  ACCESS_TOKEN,
  ROOM_ACCESS,
} from './application/ports/room-access.port';
import { ROOMS_PERSISTENCE } from './application/ports/rooms-persistence.port';
import { SOLVER } from './application/ports/solver.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Room,
      Participant,
      Candidate,
      Decision,
      ParticipantResponse,
      ParticipantCondition,
      ScoreResult,
    ]),
  ],
  controllers: [
    RoomsController,
    CandidateController,
    ParticipantResponseController,
    ParticipantConditionController,
    CalculationController,
    DecisionController,
    ParticipantLifecycleController,
  ],
  providers: [
    CreateRoomUseCase,
    JoinParticipantUseCase,
    CreateCandidateUseCase,
    UpdateCandidateUseCase,
    ArchiveCandidateUseCase,
    UpsertParticipantResponseUseCase,
    UpsertParticipantConditionUseCase,
    LeaveRoomUseCase,
    KickParticipantUseCase,
    StartCalculationUseCase,
    ConfirmDecisionUseCase,
    ReopenDecisionUseCase,
    GetRoomQuery,
    GetCalculationQuery,
    GetLatestScoreResultQuery,
    GetDecisionQuery,
    TypeOrmRoomsPersistenceAdapter,
    { provide: ROOMS_PERSISTENCE, useExisting: TypeOrmRoomsPersistenceAdapter },
    TypeOrmRoomAccessAdapter,
    { provide: ROOM_ACCESS, useExisting: TypeOrmRoomAccessAdapter },
    AccessTokenAdapter,
    { provide: ACCESS_TOKEN, useExisting: AccessTokenAdapter },
    SolverHttpClient,
    SolverAdapter,
    { provide: SOLVER, useExisting: SolverAdapter },
  ],
})
export class RoomsModule {}
