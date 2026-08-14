import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateCandidatesAndResponses20260815000000 implements MigrationInterface {
  name = 'CreateCandidatesAndResponses20260815000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'candidates',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'roomId', type: 'uuid' },
          { name: 'displayOrder', type: 'integer' },
          { name: 'time', type: 'jsonb' },
          { name: 'place', type: 'jsonb' },
          { name: 'estimatedCostPerPersonKrw', type: 'integer' },
          { name: 'tags', type: 'text', isArray: true, default: "'{}'" },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'ACTIVE'",
          },
          { name: 'version', type: 'integer', default: '1' },
          { name: 'archivedAt', type: 'timestamptz', isNullable: true },
          { name: 'createdByParticipantId', type: 'uuid' },
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
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_candidates_room',
            columnNames: ['roomId'],
            referencedTableName: 'rooms',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      })
    );

    await queryRunner.createIndex(
      'candidates',
      new TableIndex({
        name: 'IDX_candidates_room_status_order',
        columnNames: ['roomId', 'status', 'displayOrder'],
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'participant_responses',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'roomId', type: 'uuid' },
          { name: 'participantId', type: 'uuid' },
          { name: 'candidateId', type: 'uuid' },
          { name: 'availabilityStatus', type: 'varchar', length: '20' },
          { name: 'travelBurden', type: 'varchar', length: '20' },
          { name: 'note', type: 'text', isNullable: true },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'SUBMITTED'",
          },
          {
            name: 'submittedAt',
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
            name: 'FK_participant_responses_room',
            columnNames: ['roomId'],
            referencedTableName: 'rooms',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'FK_participant_responses_participant',
            columnNames: ['participantId'],
            referencedTableName: 'participants',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'FK_participant_responses_candidate',
            columnNames: ['candidateId'],
            referencedTableName: 'candidates',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_participant_responses_participant_candidate',
            columnNames: ['participantId', 'candidateId'],
          }),
        ],
      })
    );

    await queryRunner.createIndex(
      'participant_responses',
      new TableIndex({
        name: 'IDX_participant_responses_room_candidate',
        columnNames: ['roomId', 'candidateId'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('participant_responses', true, true, true);
    await queryRunner.dropTable('candidates', true, true, true);
  }
}
