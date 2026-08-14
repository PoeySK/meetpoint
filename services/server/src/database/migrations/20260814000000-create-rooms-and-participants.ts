import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateRoomsAndParticipants20260814000000 implements MigrationInterface {
  name = 'CreateRoomsAndParticipants20260814000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'rooms',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'roomCode',
            type: 'varchar',
            length: '6',
            isUnique: true,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '80',
          },
          {
            name: 'timezone',
            type: 'varchar',
            length: '64',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'DRAFT'",
          },
          {
            name: 'hostParticipantId',
            type: 'uuid',
          },
          {
            name: 'maxParticipants',
            type: 'integer',
            default: '6',
          },
          {
            name: 'latestScoreResultId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'currentDecisionId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'participants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'roomId',
            type: 'uuid',
          },
          {
            name: 'displayName',
            type: 'varchar',
            length: '30',
          },
          {
            name: 'role',
            type: 'varchar',
            length: '20',
            default: "'MEMBER'",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'JOINED'",
          },
          {
            name: 'tokenHash',
            type: 'varchar',
            length: '128',
          },
          {
            name: 'tokenExpiresAt',
            type: 'timestamptz',
          },
          {
            name: 'tokenRevokedAt',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'joinedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_participants_room',
            columnNames: ['roomId'],
            referencedTableName: 'rooms',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      })
    );

    await queryRunner.createIndex(
      'participants',
      new TableIndex({
        name: 'IDX_participants_tokenHash',
        columnNames: ['tokenHash'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // participants가 rooms를 참조하므로 participants를 먼저 삭제한다.
    await queryRunner.dropTable('participants', true, true, true);
    await queryRunner.dropTable('rooms', true, true, true);
  }
}
