use crate::{
    application::validation::validate_request,
    contract::{
        CandidateCoverage, CandidateResult, Conflict, Coverage, ParticipantBreakdown,
        ScoreComponents, ScoringMetadata, ScoringWeights, SolveRequest, SolveResponse,
    },
    domain::{
        scoring::{self, ScoringResult},
        types::SolveInput,
    },
};

use super::error::SolveError;

pub fn solve(request: SolveRequest) -> Result<SolveResponse, SolveError> {
    let input = validate_request(&request)?;
    let result = scoring::score(&input, input.policy);
    Ok(to_contract_response(input, result))
}

fn to_contract_response(input: SolveInput, result: ScoringResult) -> SolveResponse {
    let candidates = result
        .candidates
        .into_iter()
        .enumerate()
        .map(|(index, candidate)| CandidateResult {
            candidate_id: candidate.candidate_id,
            rank: index + 1,
            overall_score: candidate.overall_score,
            eligible: candidate.eligible,
            match_level: candidate.match_level.as_str().to_string(),
            hard_conflict_count: candidate.hard_conflict_count,
            coverage: CandidateCoverage {
                submitted_responses: candidate.coverage.submitted_responses,
                expected_responses: candidate.coverage.expected_responses,
            },
            participant_breakdown: candidate
                .participant_breakdown
                .into_iter()
                .map(to_contract_participant_breakdown)
                .collect(),
            reasons: candidate.reasons,
            conflicts: candidate
                .conflicts
                .into_iter()
                .map(|conflict| Conflict {
                    participant_id: conflict.participant_id,
                    code: conflict.code.as_str().to_string(),
                })
                .collect(),
            blocking_issues: candidate
                .blocking_issues
                .into_iter()
                .map(|issue| issue.as_str().to_string())
                .collect(),
            explanation_flags: candidate
                .explanation_flags
                .into_iter()
                .map(|flag| flag.as_str().to_string())
                .collect(),
        })
        .collect();

    SolveResponse {
        request_id: input.request_id,
        policy_version: input.policy_version,
        scoring_profile: input.scoring_profile,
        status: "COMPLETED",
        metadata: ScoringMetadata {
            scoring_profile: input.policy.scoring_profile,
            weights: ScoringWeights {
                time: input.policy.weights.time,
                travel_burden: input.policy.weights.travel_burden,
                budget: input.policy.weights.budget,
                preference: input.policy.weights.preference,
            },
        },
        recommendation_status: result.recommendation_status.as_str().to_string(),
        recommendation_warnings: result
            .recommendation_warnings
            .into_iter()
            .map(|warning| warning.as_str().to_string())
            .collect(),
        coverage: Coverage {
            responded_participants: result.coverage.responded_participants,
            total_participants: result.coverage.total_participants,
            submitted_responses: result.coverage.submitted_responses,
            expected_responses: result.coverage.expected_responses,
        },
        ranking: result.ranking,
        candidates,
    }
}

fn to_contract_participant_breakdown(
    breakdown: scoring::ParticipantBreakdown,
) -> ParticipantBreakdown {
    ParticipantBreakdown {
        participant_id: breakdown.participant_id,
        score: scoring::round_score(breakdown.score),
        components: ScoreComponents {
            time: breakdown.components.time,
            travel_burden: breakdown.components.travel_burden,
            budget: breakdown.components.budget,
            preference: breakdown.components.preference,
        },
        hard_conflicts: breakdown
            .hard_conflicts
            .into_iter()
            .map(|conflict| conflict.as_str().to_string())
            .collect(),
        blocking_issues: breakdown
            .blocking_issues
            .into_iter()
            .map(|issue| issue.as_str().to_string())
            .collect(),
        reasons: breakdown.reasons,
    }
}
