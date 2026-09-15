use super::solve;
use crate::{
    AvailabilityWindow, CONDITION_AWARE_POLICY_VERSION, CONDITION_AWARE_SCORING_PROFILE,
    CandidatePlace, CandidateTime, POLICY_VERSION, SCORING_PROFILE, SolveRequest, SolverCandidate,
    SolverCondition, SolverParticipant, SolverPreferences, SolverResponse,
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
            condition: None,
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

fn condition_request() -> SolveRequest {
    let mut request = request_with_responses(vec![
        response("candidate_1", "AVAILABLE", "EASY"),
        response("candidate_2", "AVAILABLE", "EASY"),
    ]);
    request.policy_version = CONDITION_AWARE_POLICY_VERSION.to_string();
    request.scoring_profile = CONDITION_AWARE_SCORING_PROFILE.to_string();
    request.participants[0].condition = Some(SolverCondition {
        availability_windows: vec![AvailabilityWindow {
            starts_at: "2026-09-01T09:00:00Z".to_string(),
            ends_at: "2026-09-01T18:00:00Z".to_string(),
        }],
        max_budget_krw: Some(30000),
        preferences: SolverPreferences {
            required_tags: vec!["INDOOR".to_string()],
            preferred_tags: vec!["QUIET".to_string()],
            avoid_tags: vec!["SMOKING".to_string()],
        },
    });
    request.candidates[0].estimated_cost_per_person_krw = 30000;
    request.candidates[0].tags = vec!["INDOOR".to_string(), "QUIET".to_string()];
    request.candidates[1].estimated_cost_per_person_krw = 60000;
    request.candidates[1].tags = vec!["INDOOR".to_string(), "SMOKING".to_string()];
    request
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
fn returns_user_friendly_reasons() {
    let result = solve(request_with_responses(vec![response(
        "candidate_1",
        "AVAILABLE",
        "EASY",
    )]))
    .unwrap();
    let complete = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_1")
        .unwrap();
    let incomplete = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_2")
        .unwrap();

    assert_eq!(complete.reasons, vec!["1명이 모두 의견을 남겼습니다."]);
    assert_eq!(
        incomplete.reasons,
        vec!["전체 1명 중 0명이 의견을 남겼습니다."]
    );
    assert_eq!(
        complete.participant_breakdown[0].reasons,
        vec![
            "참석 가능 여부: 참석 가능",
            "이동 부담: 이동 쉬움",
            "예산: 예산 제한 없음",
            "선호하는 특징: 내 기준을 입력하지 않음",
        ]
    );
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
fn averages_multiple_participants_without_dropping_missing_participants() {
    let mut request = request_with_responses(vec![response("candidate_1", "AVAILABLE", "EASY")]);
    request.participants.push(SolverParticipant {
        participant_id: "participant_2".to_string(),
        responses: vec![],
        condition: None,
    });

    let result = solve(request).unwrap();
    let candidate = &result.candidates[0];
    assert_eq!(candidate.overall_score, 50.0);
    assert_eq!(candidate.coverage.submitted_responses, 1);
    assert_eq!(candidate.coverage.expected_responses, 2);
    assert_eq!(result.coverage.total_participants, 2);
}

#[test]
fn sorts_ties_deterministically_by_display_order_then_candidate_id() {
    let mut request = request_with_responses(vec![
        response("candidate_1", "AVAILABLE", "EASY"),
        response("candidate_2", "AVAILABLE", "EASY"),
    ]);
    request.candidates[0].display_order = 2;
    request.candidates[1].display_order = 1;

    let result = solve(request).unwrap();
    assert_eq!(result.ranking, vec!["candidate_2", "candidate_1"]);

    let mut same_order = request_with_responses(vec![
        response("candidate_1", "AVAILABLE", "EASY"),
        response("candidate_2", "AVAILABLE", "EASY"),
    ]);
    same_order.candidates[0].display_order = 1;
    same_order.candidates[1].display_order = 1;
    same_order.candidates.reverse();
    assert_eq!(
        solve(same_order).unwrap().ranking,
        vec!["candidate_1", "candidate_2"]
    );
}

#[test]
fn rejects_invalid_request_data() {
    let mut no_participants = request_with_responses(vec![]);
    no_participants.participants.clear();
    assert_eq!(
        solve(no_participants).unwrap_err().code.as_str(),
        "NO_PARTICIPANTS"
    );

    let mut no_candidates = request_with_responses(vec![]);
    no_candidates.candidates.clear();
    assert_eq!(
        solve(no_candidates).unwrap_err().code.as_str(),
        "NO_CANDIDATES"
    );

    let mut invalid_time = request_with_responses(vec![]);
    invalid_time.candidates[0].time.ends_at = "not-a-time".to_string();
    assert_eq!(
        solve(invalid_time).unwrap_err().code.as_str(),
        "INVALID_TIME_RANGE"
    );

    let invalid_response = request_with_responses(vec![response("candidate_1", "UNKNOWN", "EASY")]);
    assert_eq!(
        solve(invalid_response).unwrap_err().code.as_str(),
        "RESPONSE_FIELD_MISSING"
    );
}

#[test]
fn rejects_unsupported_policy_and_duplicate_ids() {
    let mut unsupported_policy = request_with_responses(vec![]);
    unsupported_policy.policy_version = "future-1".to_string();
    assert_eq!(
        solve(unsupported_policy).unwrap_err().code.as_str(),
        "INVALID_SCHEMA"
    );

    let mut duplicate_candidates = request_with_responses(vec![]);
    duplicate_candidates.candidates[1].candidate_id = "candidate_1".to_string();
    assert_eq!(
        solve(duplicate_candidates).unwrap_err().code.as_str(),
        "INVALID_SCHEMA"
    );
}

#[test]
fn applies_condition_budget_and_preference_scores_and_conflicts() {
    let result = solve(condition_request()).unwrap();
    let matching = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_1")
        .unwrap();
    assert_eq!(matching.overall_score, 100.0);
    assert!(matching.eligible);
    assert_eq!(matching.participant_breakdown[0].components.budget, 20.0);
    assert_eq!(
        matching.participant_breakdown[0].components.preference,
        15.0
    );

    let conflicted = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_2")
        .unwrap();
    assert!(!conflicted.eligible);
    assert!(
        conflicted
            .conflicts
            .iter()
            .any(|conflict| conflict.code == "BUDGET_LIMIT_EXCEEDED")
    );
    assert!(
        conflicted
            .conflicts
            .iter()
            .any(|conflict| conflict.code == "AVOID_TAG_PRESENT")
    );
    assert_eq!(conflicted.participant_breakdown[0].components.budget, 0.0);
}

#[test]
fn allows_condition_aware_requests_without_a_participant_condition() {
    let mut request = condition_request();
    request.participants[0].condition = None;

    let result = solve(request).unwrap();
    let candidate = &result.candidates[0];

    assert_eq!(candidate.overall_score, 100.0);
    assert!(
        candidate
            .explanation_flags
            .contains(&"CONDITION_NOT_PROVIDED".to_string())
    );
}

#[test]
fn reports_available_response_outside_condition_window_as_a_conflict() {
    let mut request = condition_request();
    request.candidates[1].time.starts_at = "2026-09-01T20:00:00Z".to_string();
    request.candidates[1].time.ends_at = "2026-09-01T22:00:00Z".to_string();

    let result = solve(request).unwrap();
    let candidate = result
        .candidates
        .iter()
        .find(|candidate| candidate.candidate_id == "candidate_2")
        .unwrap();
    assert!(
        candidate
            .conflicts
            .iter()
            .any(|conflict| conflict.code == "TIME_CONDITION_CONFLICT")
    );
    assert!(!candidate.eligible);
}
