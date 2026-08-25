use crate::domain::{
    policy::{ScoringPolicy, ScoringWeights},
    scoring::{
        BlockingIssue, CandidateCoverage, Conflict, ConflictCode, ExplanationFlag, MatchLevel,
        ParticipantBreakdown, ScoreComponents, ScoredCandidate, push_unique, round_score,
    },
    types::{AvailabilityStatus, Candidate, Participant, ParticipantResponse, TravelBurden},
};

pub(super) fn score_candidate(
    candidate: &Candidate,
    participants: &[Participant],
    policy: ScoringPolicy,
) -> ScoredCandidate {
    let mut participant_breakdown = Vec::with_capacity(participants.len());
    let mut conflicts = Vec::new();
    let mut blocking_issues = Vec::new();
    let mut explanation_flags = Vec::new();
    let mut submitted_responses = 0usize;

    for participant in participants {
        let response = participant
            .responses
            .iter()
            .find(|response| response.candidate_id == candidate.id);
        let breakdown = score_participant(response, policy.weights);

        if response.is_some() {
            submitted_responses += 1;
        }
        for conflict in &breakdown.hard_conflicts {
            conflicts.push(Conflict {
                participant_id: participant.id.clone(),
                code: *conflict,
            });
        }
        for issue in &breakdown.blocking_issues {
            push_unique(&mut blocking_issues, *issue);
        }
        for flag in &breakdown.explanation_flags {
            push_unique(&mut explanation_flags, *flag);
        }

        participant_breakdown.push(breakdown.into_breakdown(participant.id.clone()));
    }

    let raw_overall_score = participant_breakdown
        .iter()
        .map(|participant| participant.score)
        .sum::<f64>()
        / participants.len() as f64;
    let overall_score = round_score(raw_overall_score);
    let has_missing_response = participant_breakdown
        .iter()
        .any(|participant| !participant.blocking_issues.is_empty());
    let hard_conflict_count = conflicts.len();
    let eligible = !has_missing_response && hard_conflict_count == 0;
    let all_full = participant_breakdown.iter().all(|participant| {
        participant.blocking_issues.is_empty()
            && participant.hard_conflicts.is_empty()
            && participant.components.time == policy.weights.time
            && participant.components.travel_burden == policy.weights.travel_burden
    });
    let match_level = if has_missing_response {
        MatchLevel::Incomplete
    } else if hard_conflict_count > 0 {
        MatchLevel::Conflicted
    } else if all_full {
        MatchLevel::Full
    } else {
        MatchLevel::Partial
    };

    if match_level == MatchLevel::Incomplete {
        push_unique(&mut explanation_flags, ExplanationFlag::MissingResponse);
    }

    let minimum_participant_score = participant_breakdown
        .iter()
        .map(|participant| participant.score)
        .fold(f64::INFINITY, f64::min);
    let expected_responses = participants.len();

    ScoredCandidate {
        candidate_id: candidate.id.clone(),
        display_order: candidate.display_order,
        raw_overall_score,
        overall_score,
        eligible,
        match_level,
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

struct ParticipantScore {
    score: f64,
    components: ScoreComponents,
    hard_conflicts: Vec<ConflictCode>,
    blocking_issues: Vec<BlockingIssue>,
    explanation_flags: Vec<ExplanationFlag>,
    reasons: Vec<String>,
}

impl ParticipantScore {
    fn into_breakdown(self, participant_id: String) -> ParticipantBreakdown {
        ParticipantBreakdown {
            participant_id,
            score: self.score,
            components: self.components,
            hard_conflicts: self.hard_conflicts,
            blocking_issues: self.blocking_issues,
            reasons: self.reasons,
        }
    }
}

fn score_participant(
    response: Option<&ParticipantResponse>,
    weights: ScoringWeights,
) -> ParticipantScore {
    let mut hard_conflicts = Vec::new();
    let mut blocking_issues = Vec::new();
    let mut explanation_flags = Vec::new();
    let (time, travel_burden, availability_reason, travel_reason) = match response {
        Some(response) => {
            let (time, availability) = match response.availability {
                AvailabilityStatus::Available => (weights.time, "AVAILABLE"),
                AvailabilityStatus::Maybe => {
                    push_unique(&mut explanation_flags, ExplanationFlag::MaybeResponse);
                    (weights.time / 2.0, "MAYBE")
                }
                AvailabilityStatus::Unavailable => {
                    hard_conflicts.push(ConflictCode::TimeUnavailable);
                    (0.0, "UNAVAILABLE")
                }
            };
            let (travel_burden, travel) = match response.travel_burden {
                TravelBurden::Easy => (weights.travel_burden, "EASY"),
                TravelBurden::Normal => {
                    push_unique(
                        &mut explanation_flags,
                        ExplanationFlag::TravelBurdenUncertain,
                    );
                    (weights.travel_burden / 2.0, "NORMAL")
                }
                TravelBurden::Hard => {
                    hard_conflicts.push(ConflictCode::TravelBurdenHard);
                    (0.0, "HARD")
                }
            };
            push_unique(
                &mut explanation_flags,
                ExplanationFlag::SelfReportedTravelBurden,
            );
            (time, travel_burden, availability, travel)
        }
        None => {
            blocking_issues.push(BlockingIssue::MissingResponse);
            push_unique(&mut explanation_flags, ExplanationFlag::MissingResponse);
            (0.0, 0.0, "MISSING", "MISSING")
        }
    };

    let (budget, preference) = if response.is_some() {
        (weights.budget, weights.preference)
    } else {
        (0.0, 0.0)
    };

    let reasons = if availability_reason == "MISSING" {
        vec![
            "response: MISSING".to_string(),
            "budget: NO_BUDGET_CONSTRAINT".to_string(),
            "preference: PREFERENCE_UNEVALUATED".to_string(),
        ]
    } else {
        vec![
            format!("availability: {availability_reason}"),
            format!("travelBurden: {travel_reason}"),
            "budget: NO_BUDGET_CONSTRAINT".to_string(),
            "preference: PREFERENCE_UNEVALUATED".to_string(),
        ]
    };

    ParticipantScore {
        score: time + travel_burden + budget + preference,
        components: ScoreComponents {
            time,
            travel_burden,
            budget,
            preference,
        },
        hard_conflicts,
        blocking_issues,
        explanation_flags,
        reasons,
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
