use crate::{
    model::{
        CandidateCoverage, CandidateResult, Conflict, Coverage, ParticipantBreakdown,
        SCORING_PROFILE, ScoreComponents, ScoringMetadata, ScoringWeights, SolveRequest,
        SolveResponse, SolverCandidate, SolverError, SolverParticipant,
    },
    validation::validate_request,
};

const TIME_WEIGHT: f64 = 40.0;
const TRAVEL_WEIGHT: f64 = 25.0;
const BUDGET_SCORE: f64 = 20.0;
const PREFERENCE_SCORE: f64 = 15.0;

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
            let mut result = candidate.into_result(index + 1, &recommendation_status);
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

#[derive(Debug)]
struct ScoredCandidate {
    candidate_id: String,
    display_order: i32,
    raw_overall_score: f64,
    overall_score: f64,
    eligible: bool,
    match_level: String,
    hard_conflict_count: usize,
    minimum_participant_score: f64,
    coverage: CandidateCoverage,
    participant_breakdown: Vec<ParticipantBreakdown>,
    reasons: Vec<String>,
    conflicts: Vec<Conflict>,
    blocking_issues: Vec<String>,
    explanation_flags: Vec<String>,
}

impl ScoredCandidate {
    fn into_result(self, rank: usize, recommendation_status: &str) -> CandidateResult {
        let mut explanation_flags = self.explanation_flags;
        if recommendation_status == "INCOMPLETE" && self.match_level == "INCOMPLETE" {
            push_unique(&mut explanation_flags, "MISSING_RESPONSE");
        }

        CandidateResult {
            candidate_id: self.candidate_id,
            rank,
            overall_score: self.overall_score,
            eligible: self.eligible,
            match_level: self.match_level,
            hard_conflict_count: self.hard_conflict_count,
            coverage: self.coverage,
            participant_breakdown: self.participant_breakdown,
            reasons: self.reasons,
            conflicts: self.conflicts,
            blocking_issues: self.blocking_issues,
            explanation_flags,
        }
    }
}

fn score_candidate(
    candidate: &SolverCandidate,
    participants: &[SolverParticipant],
) -> ScoredCandidate {
    let mut participant_breakdown = Vec::with_capacity(participants.len());
    let mut conflicts = Vec::new();
    let mut blocking_issues = Vec::new();
    let mut explanation_flags = Vec::new();
    let mut submitted_responses = 0;
    let expected_responses = participants.len();

    for participant in participants {
        let response = participant
            .responses
            .iter()
            .find(|response| response.candidate_id == candidate.candidate_id);
        let mut hard_conflicts = Vec::new();
        let mut participant_blocking_issues = Vec::new();
        let mut reasons = Vec::new();
        let mut participant_flags = Vec::new();

        let (time, travel_burden, availability, travel) = match response {
            Some(response) => {
                submitted_responses += 1;
                let (time, availability) = match response.availability_status.as_str() {
                    "AVAILABLE" => (TIME_WEIGHT, "AVAILABLE"),
                    "MAYBE" => {
                        push_unique(&mut participant_flags, "MAYBE_RESPONSE");
                        (TIME_WEIGHT / 2.0, "MAYBE")
                    }
                    "UNAVAILABLE" => {
                        hard_conflicts.push("TIME_UNAVAILABLE".to_string());
                        (0.0, "UNAVAILABLE")
                    }
                    _ => unreachable!("validated response availability"),
                };
                let (travel_burden, travel) = match response.travel_burden.as_str() {
                    "EASY" => (TRAVEL_WEIGHT, "EASY"),
                    "NORMAL" => {
                        push_unique(&mut participant_flags, "TRAVEL_BURDEN_UNCERTAIN");
                        (TRAVEL_WEIGHT / 2.0, "NORMAL")
                    }
                    "HARD" => {
                        hard_conflicts.push("TRAVEL_BURDEN_HARD".to_string());
                        (0.0, "HARD")
                    }
                    _ => unreachable!("validated response travel burden"),
                };
                push_unique(&mut participant_flags, "SELF_REPORTED_TRAVEL_BURDEN");
                (time, travel_burden, availability, travel)
            }
            None => {
                participant_blocking_issues.push("MISSING_RESPONSE".to_string());
                push_unique(&mut participant_flags, "MISSING_RESPONSE");
                (0.0, 0.0, "MISSING", "MISSING")
            }
        };

        if availability != "MISSING" {
            reasons.push(format!("availability: {availability}"));
            reasons.push(format!("travelBurden: {travel}"));
        } else {
            reasons.push("response: MISSING".to_string());
        }
        reasons.push("budget: NO_BUDGET_CONSTRAINT".to_string());
        reasons.push("preference: PREFERENCE_UNEVALUATED".to_string());

        for code in &hard_conflicts {
            conflicts.push(Conflict {
                participant_id: participant.participant_id.clone(),
                code: code.clone(),
            });
        }
        for issue in &participant_blocking_issues {
            push_unique(&mut blocking_issues, issue);
        }
        for flag in participant_flags {
            push_unique(&mut explanation_flags, &flag);
        }

        let budget = if response.is_some() {
            BUDGET_SCORE
        } else {
            0.0
        };
        let preference = if response.is_some() {
            PREFERENCE_SCORE
        } else {
            0.0
        };

        participant_breakdown.push(ParticipantBreakdown {
            participant_id: participant.participant_id.clone(),
            score: round_half_up(time + travel_burden + budget + preference, 1),
            components: ScoreComponents {
                time,
                travel_burden,
                budget,
                preference,
            },
            hard_conflicts,
            blocking_issues: participant_blocking_issues,
            reasons,
        });
    }

    let raw_overall_score = participant_breakdown
        .iter()
        .map(|participant| participant.score)
        .sum::<f64>()
        / participants.len() as f64;
    let overall_score = round_half_up(raw_overall_score, 1);
    let has_missing_response = participant_breakdown
        .iter()
        .any(|participant| !participant.blocking_issues.is_empty());
    let hard_conflict_count = conflicts.len();
    let eligible = !has_missing_response && hard_conflict_count == 0;
    let all_full = participant_breakdown.iter().all(|participant| {
        participant.blocking_issues.is_empty()
            && participant.hard_conflicts.is_empty()
            && participant.components.time == TIME_WEIGHT
            && participant.components.travel_burden == TRAVEL_WEIGHT
    });
    let match_level = if has_missing_response {
        "INCOMPLETE"
    } else if hard_conflict_count > 0 {
        "CONFLICTED"
    } else if all_full {
        "FULL"
    } else {
        "PARTIAL"
    };

    if match_level == "INCOMPLETE" {
        push_unique(&mut explanation_flags, "MISSING_RESPONSE");
    }

    let minimum_participant_score = participant_breakdown
        .iter()
        .map(|participant| participant.score)
        .fold(f64::INFINITY, f64::min);

    ScoredCandidate {
        candidate_id: candidate.candidate_id.clone(),
        display_order: candidate.display_order,
        raw_overall_score,
        overall_score,
        eligible,
        match_level: match_level.to_string(),
        hard_conflict_count,
        minimum_participant_score,
        coverage: CandidateCoverage {
            submitted_responses,
            expected_responses,
        },
        participant_breakdown,
        reasons: candidate_reasons(submitted_responses, expected_responses),
        conflicts,
        blocking_issues,
        explanation_flags,
    }
}

fn candidate_reasons(submitted_responses: usize, expected_responses: usize) -> Vec<String> {
    if submitted_responses == expected_responses {
        vec![format!("{submitted_responses} responses submitted")]
    } else {
        vec![format!(
            "{submitted_responses}/{expected_responses} responses submitted"
        )]
    }
}

fn round_half_up(value: f64, decimal_places: u32) -> f64 {
    let factor = 10_f64.powi(decimal_places as i32);
    (value * factor).round() / factor
}

fn push_unique(values: &mut Vec<String>, value: &str) {
    if !values.iter().any(|current| current == value) {
        values.push(value.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CandidatePlace, CandidateTime, POLICY_VERSION, SolverResponse};

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

    fn response(
        candidate_id: &str,
        availability_status: &str,
        travel_burden: &str,
    ) -> SolverResponse {
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

        let invalid_response =
            request_with_responses(vec![response("candidate_1", "UNKNOWN", "EASY")]);
        assert_eq!(
            solve(invalid_response).unwrap_err().code,
            "RESPONSE_FIELD_MISSING"
        );
    }
}
