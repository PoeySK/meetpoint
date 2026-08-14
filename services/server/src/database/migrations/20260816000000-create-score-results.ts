import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateScoreResults20260816000000 implements MigrationInterface {
  name = 'CreateScoreResults20260816000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'score_results',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'roomId', type: 'uuid' },
          { name: 'clientRequestId', type: 'varchar', length: '128' },
          { name: 'status', type: 'varchar', length: '20' },
          { name: 'policyVersion', type: 'varchar', length: '32' },
          { name: 'scoringProfile', type: 'varchar', length: '64' },
          { name: 'inputSnapshotHash', type: 'varchar', length: '128' },
          { name: 'participantCount', type: 'integer' },
          { name: 'candidateCount', type: 'integer' },
          { name: 'coverage', type: 'jsonb' },
          {
            name: 'recommendationStatus',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'recommendationWarnings',
            type: 'text',
            isArray: true,
            default: "'{}'",
          },
          { name: 'ranking', type: 'jsonb' },
          { name: 'candidates', type: 'jsonb' },
          { name: 'metadata', type: 'jsonb' },
          { name: 'error', type: 'jsonb', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          { name: 'completedAt', type: 'timestamptz', isNullable: true },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_score_results_room',
            columnNames: ['roomId'],
            referencedTableName: 'rooms',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_score_results_room_client_request',
            columnNames: ['roomId', 'clientRequestId'],
          }),
        ],
      })
    );

    await queryRunner.createIndex(
      'score_results',
      new TableIndex({
        name: 'IDX_score_results_room_created',
        columnNames: ['roomId', 'createdAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('score_results', true, true, true);
  }
}
