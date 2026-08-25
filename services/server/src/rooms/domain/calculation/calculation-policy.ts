import type { ScoreResultMetadata } from './score-result';

export const CALCULATION_POLICY_VERSION = 'mvp-1';
export const CALCULATION_SCORING_PROFILE = 'MVP_NO_CONDITIONS';
export const CALCULATION_WEIGHTS = {
  time: 40,
  travelBurden: 25,
  budget: 20,
  preference: 15,
} as const;

export function createScoringMetadata(): ScoreResultMetadata {
  return {
    scoringProfile: CALCULATION_SCORING_PROFILE,
    weights: { ...CALCULATION_WEIGHTS },
  };
}
