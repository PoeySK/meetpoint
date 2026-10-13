import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconfirmEditedCandidateResponses20261012000000 implements MigrationInterface {
  name = 'ReconfirmEditedCandidateResponses20261012000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 기존 job의 snapshot을 재작성하지 않는다. 쓰기를 막고 worker를 drain한 뒤 실행한다.
    const pending: unknown = await queryRunner.query(`
      SELECT 1 FROM calculation_jobs WHERE status IN ('REQUESTED', 'RUNNING') LIMIT 1
    `);
    if (!Array.isArray(pending) || pending.length > 0) {
      throw new Error(
        'Drain calculation jobs before response reconfirmation migration.'
      );
    }
    // 과거 version에는 변경 필드 이력이 없어 표시 변경도 보수적으로 포함한다.
    await queryRunner.query(`
      UPDATE participant_responses r
      SET status = 'RECONFIRM_REQUIRED', "updatedAt" = CURRENT_TIMESTAMP
      FROM candidates c, rooms room, participants p
      WHERE r."candidateId" = c.id AND r."roomId" = room.id
        AND r."participantId" = p.id AND p.status IN ('JOINED', 'RESPONDED')
        AND c.status = 'ACTIVE' AND c.version > 1
        AND room.status IN ('DRAFT', 'OPEN', 'CALCULATED') AND r.status = 'SUBMITTED'
    `);
    await queryRunner.query(`
      UPDATE participants p SET status = 'JOINED', "updatedAt" = CURRENT_TIMESTAMP
      WHERE p.status = 'RESPONDED' AND EXISTS (
        SELECT 1 FROM participant_responses r JOIN candidates c ON c.id = r."candidateId"
        WHERE r."participantId" = p.id AND c.status = 'ACTIVE' AND r.status = 'RECONFIRM_REQUIRED'
      )
    `);
    await queryRunner.query(`
      UPDATE score_results s SET status = 'STALE'
      FROM rooms room WHERE s.id = room."latestScoreResultId" AND s.status = 'COMPLETED'
        AND room.status IN ('DRAFT', 'OPEN', 'CALCULATED') AND EXISTS (
          SELECT 1 FROM participant_responses r WHERE r."roomId" = room.id AND r.status = 'RECONFIRM_REQUIRED'
        )
    `);
    await queryRunner.query(`
      UPDATE rooms room SET status = 'OPEN', "updatedAt" = CURRENT_TIMESTAMP
      WHERE room.status = 'CALCULATED' AND EXISTS (
        SELECT 1 FROM participant_responses r WHERE r."roomId" = room.id AND r.status = 'RECONFIRM_REQUIRED'
      )
    `);
  }

  down(): Promise<void> {
    // 이전 의견을 새 후보에 대한 동의로 되돌리지 않는다.
    return Promise.reject(
      new Error(
        'Response reconfirmation requires a forward fix; consent cannot be restored by rollback.'
      )
    );
  }
}
