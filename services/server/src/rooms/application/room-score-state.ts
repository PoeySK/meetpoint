import { ScoreResultStatus } from '../domain/calculation/score-result';
import type { RoomRecord } from '../domain/room/room-status';
import type { RoomsRepositories } from './ports/rooms-persistence.port';

export async function markLatestScoreResultStale(
  repositories: RoomsRepositories,
  room: RoomRecord
): Promise<void> {
  if (!room.latestScoreResultId) {
    return;
  }

  const scoreResult = await repositories.scoreResults.findById(
    room.latestScoreResultId
  );
  if (scoreResult && scoreResult.status === ScoreResultStatus.COMPLETED) {
    scoreResult.status = ScoreResultStatus.STALE;
    await repositories.scoreResults.save(scoreResult);
  }
}
