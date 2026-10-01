import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParticipantRecovery20261001000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "participants" ADD COLUMN "recoveryHash" varchar(64), ADD COLUMN "recoveryExpiresAt" timestamptz'
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "participants" DROP COLUMN "recoveryHash", DROP COLUMN "recoveryExpiresAt"'
    );
  }
}
