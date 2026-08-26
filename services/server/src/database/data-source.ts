import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Participant } from '../rooms/infrastructure/persistence/typeorm/entities/participant.entity';
import { Candidate } from '../rooms/infrastructure/persistence/typeorm/entities/candidate.entity';
import { Decision } from '../rooms/infrastructure/persistence/typeorm/entities/decision.entity';
import { ParticipantResponse } from '../rooms/infrastructure/persistence/typeorm/entities/participant-response.entity';
import { ParticipantCondition } from '../rooms/infrastructure/persistence/typeorm/entities/participant-condition.entity';
import { Room } from '../rooms/infrastructure/persistence/typeorm/entities/room.entity';
import { ScoreResult } from '../rooms/infrastructure/persistence/typeorm/entities/score-result.entity';
import { CreateRoomsAndParticipants20260814000000 } from './migrations/20260814000000-create-rooms-and-participants';
import { CreateCandidatesAndResponses20260815000000 } from './migrations/20260815000000-create-candidates-and-responses';
import { CreateScoreResults20260816000000 } from './migrations/20260816000000-create-score-results';
import { CreateDecisions20260817000000 } from './migrations/20260817000000-create-decisions';
import { CreateParticipantConditions20260818000000 } from './migrations/20260818000000-create-participant-conditions';

export const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint';

const dataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [
    Room,
    Participant,
    Candidate,
    ParticipantResponse,
    ScoreResult,
    Decision,
    ParticipantCondition,
  ],
  migrations: [
    CreateRoomsAndParticipants20260814000000,
    CreateCandidatesAndResponses20260815000000,
    CreateScoreResults20260816000000,
    CreateDecisions20260817000000,
    CreateParticipantConditions20260818000000,
  ],
  synchronize: false,
  migrationsRun: false,
});

export default dataSource;
