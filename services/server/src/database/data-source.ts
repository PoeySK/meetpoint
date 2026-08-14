import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Participant } from '../participants/entities/participant.entity';
import { Candidate } from '../rooms/entities/candidate.entity';
import { ParticipantResponse } from '../rooms/entities/participant-response.entity';
import { Room } from '../rooms/entities/room.entity';
import { CreateRoomsAndParticipants20260814000000 } from './migrations/20260814000000-create-rooms-and-participants';
import { CreateCandidatesAndResponses20260815000000 } from './migrations/20260815000000-create-candidates-and-responses';

export const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint';

const dataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [Room, Participant, Candidate, ParticipantResponse],
  migrations: [
    CreateRoomsAndParticipants20260814000000,
    CreateCandidatesAndResponses20260815000000,
  ],
  synchronize: false,
  migrationsRun: false,
});

export default dataSource;
