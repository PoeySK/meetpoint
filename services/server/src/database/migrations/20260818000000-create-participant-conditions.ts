import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateParticipantConditions20260818000000 implements MigrationInterface {
  name = 'CreateParticipantConditions20260818000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'participant_conditions',
        columns: [
          { name: 'participantId', type: 'uuid', isPrimary: true },
          { name: 'roomId', type: 'uuid' },
          { name: 'availabilityWindows', type: 'jsonb' },
          { name: 'maxBudgetKrw', type: 'integer', isNullable: true },
          {
            name: 'requiredTags',
            type: 'text',
            isArray: true,
            default: "'{}'",
          },
          {
            name: 'preferredTags',
            type: 'text',
            isArray: true,
            default: "'{}'",
          },
          { name: 'avoidTags', type: 'text', isArray: true, default: "'{}'" },
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
            name: 'FK_participant_conditions_room',
            columnNames: ['roomId'],
            referencedTableName: 'rooms',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            name: 'FK_participant_conditions_participant',
            columnNames: ['participantId'],
            referencedTableName: 'participants',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      })
    );

    await queryRunner.createIndex(
      'participant_conditions',
      new TableIndex({
        name: 'IDX_participant_conditions_room',
        columnNames: ['roomId'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('participant_conditions', true, true, true);
  }
}
