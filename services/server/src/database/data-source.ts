import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Participant } from '../participants/entities/participant.entity';
import { Room } from '../rooms/entities/room.entity';
import { CreateRoomsAndParticipants20260814000000 } from './migrations/20260814000000-create-rooms-and-participants';

export const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://meetpoint:meetpoint-local@localhost:5432/meetpoint';

const dataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [Room, Participant],
  migrations: [CreateRoomsAndParticipants20260814000000],
  synchronize: false,
  migrationsRun: false,
});

export default dataSource;
