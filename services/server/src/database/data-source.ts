import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Participant } from '../participants/entities/participant.entity';
import { Candidate } from '../rooms/entities/candidate.entity';
import { ParticipantResponse } from '../rooms/entities/participant-response.entity';
import { Room } from '../rooms/entities/room.entity';
import { ScoreResult } from '../rooms/entities/score-result.entity';
import { CreateRoomsAndParticipants20260814000000 } from './migrations/20260814000000-create-rooms-and-participants';
import { CreateCandidatesAndResponses20260815000000 } from './migrations/20260815000000-create-candidates-and-responses';
import { CreateScoreResults20260816000000 } from './migrations/20260816000000-create-score-results';

export const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint';

const dataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [Room, Participant, Candidate, ParticipantResponse, ScoreResult],
  migrations: [
    CreateRoomsAndParticipants20260814000000,
    CreateCandidatesAndResponses20260815000000,
    CreateScoreResults20260816000000,
  ],
  synchronize: false,
  migrationsRun: false,
});

export default dataSource;
