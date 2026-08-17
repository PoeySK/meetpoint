use crate::model::{
    CandidateCoverage, CandidateResult, Conflict, ParticipantBreakdown, ScoreComponents,
    SolverCandidate, SolverParticipant,
};

pub(super) const TIME_WEIGHT: f64 = 40.0;
pub(super) const TRAVEL_WEIGHT: f64 = 25.0;
pub(super) const BUDGET_SCORE: f64 = 20.0;
pub(super) const PREFERENCE_SCORE: f64 = 15.0;

#[derive(Debug)]
pub(super) struct ScoredCandidate {
    pub(super) candidate_id: String,
    pub(super) display_order: i32,
    pub(super) raw_overall_score: f64,
    pub(super) overall_score: f64,
    pub(super) eligible: bool,
    pub(super) match_level: String,
    pub(super) hard_conflict_count: usize,
    pub(super) minimum_participant_score: f64,
    pub(super) coverage: CandidateCoverage,
    pub(super) participant_breakdown: Vec<ParticipantBreakdown>,
    pub(super) reasons: Vec<String>,
    pub(super) conflicts: Vec<Conflict>,
    pub(super) blocking_issues: Vec<String>,
    pub(super) explanation_flags: Vec<String>,
}

impl ScoredCandidate {
    pub(super) fn into_result(self, rank: usize, recommendation_status: &str) -> CandidateResult {
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

pub(super) fn score_candidate(
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

pub(super) fn push_unique(values: &mut Vec<String>, value: &str) {
    if !values.iter().any(|current| current == value) {
        values.push(value.to_string());
    }
}
