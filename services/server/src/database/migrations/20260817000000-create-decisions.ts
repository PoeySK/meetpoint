import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateDecisions20260817000000 implements MigrationInterface {
  name = 'CreateDecisions20260817000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'decisions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'roomId', type: 'uuid' },
          { name: 'candidateId', type: 'uuid' },
          { name: 'scoreResultId', type: 'uuid' },
          { name: 'decidedByParticipantId', type: 'uuid' },
          { name: 'status', type: 'varchar', length: '20' },
          { name: 'acknowledgeIssues', type: 'boolean' },
          { name: 'decisionNote', type: 'text', isNullable: true },
          { name: 'confirmedAt', type: 'timestamptz' },
          { name: 'replacedDecisionId', type: 'uuid', isNullable: true },
          { name: 'reopenedAt', type: 'timestamptz', isNullable: true },
          { name: 'reopenReason', type: 'text', isNullable: true },
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

    await queryRunner.createForeignKeys('decisions', [
      new TableForeignKey({
        name: 'FK_decisions_room',
        columnNames: ['roomId'],
        referencedTableName: 'rooms',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_decisions_candidate',
        columnNames: ['candidateId'],
        referencedTableName: 'candidates',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        name: 'FK_decisions_score_result',
        columnNames: ['scoreResultId'],
        referencedTableName: 'score_results',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        name: 'FK_decisions_decided_by_participant',
        columnNames: ['decidedByParticipantId'],
        referencedTableName: 'participants',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        name: 'FK_decisions_replaced_decision',
        columnNames: ['replacedDecisionId'],
        referencedTableName: 'decisions',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createIndices('decisions', [
      new TableIndex({
        name: 'IDX_decisions_room_status',
        columnNames: ['roomId', 'status'],
      }),
      new TableIndex({
        name: 'IDX_decisions_room_confirmed_at',
        columnNames: ['roomId', 'confirmedAt'],
      }),
      new TableIndex({
        name: 'IDX_decisions_room_score_result',
        columnNames: ['roomId', 'scoreResultId'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('decisions', true, true, true);
  }
}
