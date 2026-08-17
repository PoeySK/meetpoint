import { EntityManager } from 'typeorm';
import { Room } from './entities/room.entity';
import { ScoreResult, ScoreResultStatus } from './entities/score-result.entity';

export async function markLatestScoreResultStale(
  manager: EntityManager,
  room: Room
): Promise<void> {
  if (!room.latestScoreResultId) {
    return;
  }

  const scoreResultRepository = manager.getRepository(ScoreResult);
  const scoreResult = await scoreResultRepository.findOneBy({
    id: room.latestScoreResultId,
    roomId: room.id,
  });
  if (scoreResult && scoreResult.status === ScoreResultStatus.COMPLETED) {
    scoreResult.status = ScoreResultStatus.STALE;
    await scoreResultRepository.save(scoreResult);
  }
}
