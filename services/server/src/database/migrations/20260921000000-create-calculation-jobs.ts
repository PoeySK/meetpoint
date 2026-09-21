import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateCalculationJobs20260921000000 implements MigrationInterface {
  name = 'CreateCalculationJobs20260921000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'calculation_jobs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'roomId', type: 'uuid' },
          { name: 'scoreResultId', type: 'uuid' },
          { name: 'snapshot', type: 'jsonb' },
          { name: 'status', type: 'varchar', length: '20' },
          { name: 'attemptCount', type: 'integer', default: '0' },
          { name: 'maxAttempts', type: 'integer', default: '3' },
          { name: 'nextAttemptAt', type: 'timestamptz' },
          { name: 'lockedAt', type: 'timestamptz', isNullable: true },
          { name: 'lastError', type: 'jsonb', isNullable: true },
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
          { name: 'completedAt', type: 'timestamptz', isNullable: true },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_calculation_jobs_room',
            columnNames: ['roomId'],
            referencedTableName: 'rooms',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'FK_calculation_jobs_score_result',
            columnNames: ['scoreResultId'],
            referencedTableName: 'score_results',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_calculation_jobs_score_result',
            columnNames: ['scoreResultId'],
          }),
        ],
      })
    );
    await queryRunner.createIndex(
      'calculation_jobs',
      new TableIndex({
        name: 'IDX_calculation_jobs_dispatch',
        columnNames: ['status', 'nextAttemptAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('calculation_jobs', true, true, true);
  }
}
