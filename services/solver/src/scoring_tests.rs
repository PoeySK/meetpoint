use super::*;
use crate::{
    CandidatePlace, CandidateTime, POLICY_VERSION, SolverCandidate, SolverParticipant,
    SolverResponse,
};

fn request_with_responses(responses: Vec<SolverResponse>) -> SolveRequest {
    SolveRequest {
        request_id: "req_test".to_string(),
        policy_version: POLICY_VERSION.to_string(),
        scoring_profile: SCORING_PROFILE.to_string(),
        room_id: "room_test".to_string(),
        participants: vec![SolverParticipant {
            participant_id: "participant_1".to_string(),
            responses,
        }],
        candidates: vec![candidate("candidate_1", 1), candidate("candidate_2", 2)],
    }
}

fn candidate(candidate_id: &str, display_order: i32) -> SolverCandidate {
    SolverCandidate {
        candidate_id: candidate_id.to_string(),
        display_order,
        time: CandidateTime {
            starts_at: "2026-09-01T10:00:00Z".to_string(),
            ends_at: "2026-09-01T12:00:00Z".to_string(),
            timezone: "Asia/Seoul".to_string(),
        },
        place: CandidatePlace {
            name: "Place".to_string(),
            address: "Address".to_string(),
            area: "Area".to_string(),
        },
        estimated_cost_per_person_krw: 15000,
        tags: vec![],
    }
}

fn response(candidate_id: &str, availability_status: &str, travel_burden: &str) -> SolverResponse {
    SolverResponse {
        candidate_id: candidate_id.to_string(),
        availability_status: availability_status.to_string(),
        travel_burden: travel_burden.to_string(),
        note: None,
    }
}

#[test]
fn uses_conditionless_budget_and_preference_defaults() {
    let result = solve(request_with_responses(vec![response(
        "candidate_1",
        "AVAILABLE",
        "EASY",
    )]))
    .unwrap();
    let candidate = &result.candidates[0];

    assert_eq!(candidate.overall_score, 100.0);
    assert_eq!(candidate.participant_breakdown[0].components.budget, 20.0);
    assert_eq!(
        candidate.participant_breakdown[0].components.preference,
        15.0
    );
    assert_eq!(result.metadata.scoring_profile, SCORING_PROFILE);
}

#[test]
fn calculates_easy_normal_and_hard_scores() {
    let mut request = request_with_responses(vec![
        response("candidate_1", "AVAILABLE", "EASY"),
        response("candidate_2", "AVAILABLE", "NORMAL"),
    ]);
    request.candidates.push(candidate("candidate_3", 3));
    request.participants[0]
        .responses
        .push(response("candidate_3", "AVAILABLE", "HARD"));

    let result = solve(request).unwrap();
    assert_eq!(result.candidates[0].overall_score, 100.0);
    assert_eq!(result.candidates[1].overall_score, 87.5);
    assert_eq!(result.candidates[2].overall_score, 75.0);
}

#[test]
fn applies_availability_rules_and_hard_conflict() {
    let request = request_with_responses(vec![
        response("candidate_1", "MAYBE", "EASY"),
        response("candidate_2", "UNAVAILABLE", "EASY"),
    ]);
    let result = solve(request).unwrap();

    let maybe = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_1")
        .unwrap();
    assert_eq!(maybe.overall_score, 80.0);
    assert_eq!(maybe.match_level, "PARTIAL");
    assert!(
        maybe
            .explanation_flags
            .contains(&"MAYBE_RESPONSE".to_string())
    );

    let unavailable = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_2")
        .unwrap();
    assert!(!unavailable.eligible);
    assert_eq!(unavailable.match_level, "CONFLICTED");
    assert_eq!(unavailable.conflicts[0].code, "TIME_UNAVAILABLE");
}

#[test]
fn treats_missing_response_as_zero_and_incomplete() {
    let result = solve(request_with_responses(vec![response(
        "candidate_1",
        "AVAILABLE",
        "EASY",
    )]))
    .unwrap();
    let missing = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_2")
        .unwrap();

    assert_eq!(missing.overall_score, 0.0);
    assert!(!missing.eligible);
    assert_eq!(missing.match_level, "INCOMPLETE");
    assert_eq!(missing.coverage.submitted_responses, 0);
    assert_eq!(result.recommendation_status, "INCOMPLETE");
}

#[test]
fn marks_low_score_without_missing_responses() {
    let request = request_with_responses(vec![
        response("candidate_1", "UNAVAILABLE", "HARD"),
        response("candidate_2", "UNAVAILABLE", "HARD"),
    ]);
    let result = solve(request).unwrap();

    assert_eq!(result.recommendation_warnings, vec!["LOW_SCORE"]);
    assert_eq!(result.recommendation_status, "NO_FULL_MATCH");
    assert!(result.candidates.iter().all(|candidate| {
        candidate
            .explanation_flags
            .contains(&"NO_FULL_MATCH".to_string())
    }));
}

#[test]
fn determines_full_and_partial_match_levels() {
    let request = request_with_responses(vec![
        response("candidate_1", "AVAILABLE", "EASY"),
        response("candidate_2", "MAYBE", "NORMAL"),
    ]);
    let result = solve(request).unwrap();

    let full = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_1")
        .unwrap();
    let partial = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_2")
        .unwrap();
    assert_eq!(full.match_level, "FULL");
    assert_eq!(partial.match_level, "PARTIAL");
    assert_eq!(result.recommendation_status, "FULL_MATCH");
}

#[test]
fn sorts_ties_by_eligibility_score_minimum_conflicts_then_display_order() {
    let mut request = request_with_responses(vec![
        response("candidate_1", "AVAILABLE", "EASY"),
        response("candidate_2", "AVAILABLE", "EASY"),
    ]);
    request.candidates[0].display_order = 2;
    request.candidates[1].display_order = 1;

    let result = solve(request).unwrap();
    assert_eq!(result.ranking, vec!["candidate_2", "candidate_1"]);
    assert_eq!(result.candidates[0].rank, 1);
    assert_eq!(result.candidates[1].rank, 2);
}

#[test]
fn sorts_same_display_order_deterministically_by_candidate_id() {
    let mut request = request_with_responses(vec![
        response("candidate_1", "AVAILABLE", "EASY"),
        response("candidate_2", "AVAILABLE", "EASY"),
    ]);
    request.candidates[0].display_order = 1;
    request.candidates[1].display_order = 1;
    request.candidates.reverse();

    let result = solve(request).unwrap();

    assert_eq!(result.ranking, vec!["candidate_1", "candidate_2"]);
}

#[test]
fn rejects_invalid_request_data() {
    let mut no_participants = request_with_responses(vec![]);
    no_participants.participants.clear();
    assert_eq!(solve(no_participants).unwrap_err().code, "NO_PARTICIPANTS");

    let mut no_candidates = request_with_responses(vec![]);
    no_candidates.candidates.clear();
    assert_eq!(solve(no_candidates).unwrap_err().code, "NO_CANDIDATES");

    let mut invalid_time = request_with_responses(vec![]);
    invalid_time.candidates[0].time.ends_at = "not-a-time".to_string();
    assert_eq!(solve(invalid_time).unwrap_err().code, "INVALID_TIME_RANGE");

    let invalid_response = request_with_responses(vec![response("candidate_1", "UNKNOWN", "EASY")]);
    assert_eq!(
        solve(invalid_response).unwrap_err().code,
        "RESPONSE_FIELD_MISSING"
    );
}
