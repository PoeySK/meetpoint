mod candidate;

use crate::{
    model::{
        Coverage, SCORING_PROFILE, ScoringMetadata, ScoringWeights, SolveRequest, SolveResponse,
        SolverError,
    },
    validation::validate_request,
};
use candidate::{
    BUDGET_SCORE, PREFERENCE_SCORE, TIME_WEIGHT, TRAVEL_WEIGHT, push_unique, score_candidate,
};

pub fn solve(request: SolveRequest) -> Result<SolveResponse, SolverError> {
    validate_request(&request)?;

    let expected_responses = request.participants.len() * request.candidates.len();
    let submitted_responses = request
        .participants
        .iter()
        .map(|participant| participant.responses.len())
        .sum();
    let responded_participants = request
        .participants
        .iter()
        .filter(|participant| !participant.responses.is_empty())
        .count();

    let mut scored_candidates = request
        .candidates
        .iter()
        .map(|candidate| score_candidate(candidate, &request.participants))
        .collect::<Vec<_>>();

    scored_candidates.sort_by(|left, right| {
        right
            .eligible
            .cmp(&left.eligible)
            .then_with(|| right.raw_overall_score.total_cmp(&left.raw_overall_score))
            .then_with(|| {
                right
                    .minimum_participant_score
                    .total_cmp(&left.minimum_participant_score)
            })
            .then_with(|| left.hard_conflict_count.cmp(&right.hard_conflict_count))
            .then_with(|| left.display_order.cmp(&right.display_order))
            .then_with(|| left.candidate_id.cmp(&right.candidate_id))
    });

    let has_incomplete = scored_candidates
        .iter()
        .any(|candidate| candidate.match_level == "INCOMPLETE");
    let has_full = scored_candidates
        .iter()
        .any(|candidate| candidate.match_level == "FULL");
    let has_partial = scored_candidates
        .iter()
        .any(|candidate| candidate.match_level == "PARTIAL");
    let recommendation_status = if has_incomplete {
        "INCOMPLETE"
    } else if has_full {
        "FULL_MATCH"
    } else if has_partial {
        "PARTIAL_MATCH"
    } else {
        "NO_FULL_MATCH"
    };

    let mut recommendation_warnings = Vec::new();
    if !has_incomplete
        && scored_candidates
            .iter()
            .map(|candidate| candidate.overall_score)
            .fold(0.0, f64::max)
            < 60.0
    {
        recommendation_warnings.push("LOW_SCORE".to_string());
    }

    let mut candidates = scored_candidates
        .into_iter()
        .enumerate()
        .map(|(index, candidate)| {
            let mut result = candidate.into_result(index + 1, recommendation_status);
            if recommendation_status == "NO_FULL_MATCH" {
                push_unique(&mut result.explanation_flags, "NO_FULL_MATCH");
            }
            result
        })
        .collect::<Vec<_>>();

    let ranking = candidates
        .iter()
        .map(|candidate| candidate.candidate_id.clone())
        .collect();

    Ok(SolveResponse {
        request_id: request.request_id,
        policy_version: request.policy_version,
        scoring_profile: request.scoring_profile,
        status: "COMPLETED",
        metadata: ScoringMetadata {
            scoring_profile: SCORING_PROFILE,
            weights: ScoringWeights {
                time: TIME_WEIGHT,
                travel_burden: TRAVEL_WEIGHT,
                budget: BUDGET_SCORE,
                preference: PREFERENCE_SCORE,
            },
        },
        recommendation_status: recommendation_status.to_string(),
        recommendation_warnings,
        coverage: Coverage {
            responded_participants,
            total_participants: request.participants.len(),
            submitted_responses,
            expected_responses,
        },
        ranking,
        candidates: std::mem::take(&mut candidates),
    })
}

#[cfg(test)]
#[path = "scoring_tests.rs"]
mod tests;
