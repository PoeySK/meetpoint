use crate::domain::{
    policy::ScoringPolicy,
    scoring::{
        BlockingIssue, CandidateCoverage, Conflict, ConflictCode, ExplanationFlag, MatchLevel,
        ParticipantBreakdown, ScoreComponents, ScoredCandidate, push_unique, round_score,
    },
    types::{
        AvailabilityStatus, Candidate, Participant, ParticipantCondition, ParticipantResponse,
        TravelBurden,
    },
};
use std::collections::HashSet;

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
        let breakdown =
            score_participant(response, participant.condition.as_ref(), candidate, policy);

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
            && participant.components.budget == policy.weights.budget
            && participant.components.preference == policy.weights.preference
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
    condition: Option<&ParticipantCondition>,
    candidate: &Candidate,
    policy: ScoringPolicy,
) -> ParticipantScore {
    let weights = policy.weights;
    let mut hard_conflicts = Vec::new();
    let mut blocking_issues = Vec::new();
    let mut explanation_flags = Vec::new();
    if policy.condition_aware && condition.is_none() {
        push_unique(
            &mut explanation_flags,
            ExplanationFlag::ConditionNotProvided,
        );
    }
    let (time, travel_burden, availability_reason, travel_reason) = match response {
        Some(response) => {
            let (time, availability) = match response.availability {
                AvailabilityStatus::Available
                    if policy.condition_aware
                        && condition.is_some_and(|condition| {
                            !condition.availability_windows.iter().any(|window| {
                                candidate.starts_at >= window.starts_at
                                    && candidate.ends_at <= window.ends_at
                            })
                        }) =>
                {
                    hard_conflicts.push(ConflictCode::TimeConditionConflict);
                    (0.0, "AVAILABLE_OUTSIDE_CONDITION")
                }
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

    let (budget, budget_reason) = match (response, condition) {
        (None, _) => (0.0, "의견 없음".to_string()),
        (Some(_), None) => (weights.budget, "예산 제한 없음".to_string()),
        (Some(_), Some(condition)) => score_budget(
            condition.max_budget_krw,
            candidate.estimated_cost_per_person_krw,
            weights.budget,
            &mut hard_conflicts,
            &mut explanation_flags,
        ),
    };
    let (preference, preference_reason) = match (response, condition) {
        (None, _) => (0.0, "의견 없음".to_string()),
        (Some(_), None) => (weights.preference, "내 기준을 입력하지 않음".to_string()),
        (Some(_), Some(condition)) => score_preferences(
            condition,
            &candidate.tags,
            weights.preference,
            &mut hard_conflicts,
        ),
    };

    let mut reasons = if availability_reason == "MISSING" {
        vec!["참석 가능 여부: 아직 작성하지 않음".to_string()]
    } else {
        vec![
            format!(
                "참석 가능 여부: {}",
                availability_reason_label(availability_reason)
            ),
            format!("이동 부담: {}", travel_burden_reason_label(travel_reason)),
        ]
    };
    reasons.push(format!("예산: {budget_reason}"));
    reasons.push(format!("선호하는 특징: {preference_reason}"));

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

fn availability_reason_label(reason: &str) -> &'static str {
    match reason {
        "AVAILABLE" => "참석 가능",
        "AVAILABLE_OUTSIDE_CONDITION" => "내가 가능한 시간과 다름",
        "MAYBE" => "참석 여부 보류",
        "UNAVAILABLE" => "참석 불가",
        _ => "확인 필요",
    }
}

fn travel_burden_reason_label(reason: &str) -> &'static str {
    match reason {
        "EASY" => "이동 쉬움",
        "NORMAL" => "이동 보통",
        "HARD" => "이동 어려움",
        _ => "확인 필요",
    }
}

fn score_budget(
    max_budget_krw: Option<i32>,
    cost: i32,
    weight: f64,
    hard_conflicts: &mut Vec<ConflictCode>,
    explanation_flags: &mut Vec<ExplanationFlag>,
) -> (f64, String) {
    let Some(max_budget_krw) = max_budget_krw else {
        push_unique(explanation_flags, ExplanationFlag::NoBudgetConstraint);
        return (weight, "예산 제한 없음".to_string());
    };

    let budget = max_budget_krw as f64;
    let cost = cost as f64;
    if cost <= budget {
        return (weight, "예산 범위 안".to_string());
    }

    hard_conflicts.push(ConflictCode::BudgetLimitExceeded);
    if budget == 0.0 {
        return (0.0, "예산 초과".to_string());
    }

    if cost <= budget * 2.0 {
        (weight * (2.0 - cost / budget), "예산 초과".to_string())
    } else {
        (0.0, "예산을 크게 초과".to_string())
    }
}

fn score_preferences(
    condition: &ParticipantCondition,
    candidate_tags: &[String],
    weight: f64,
    hard_conflicts: &mut Vec<ConflictCode>,
) -> (f64, String) {
    let candidate_tags = candidate_tags.iter().collect::<HashSet<_>>();
    let required_missing = condition
        .required_tags
        .iter()
        .any(|tag| !candidate_tags.contains(tag));
    let avoid_present = condition
        .avoid_tags
        .iter()
        .any(|tag| candidate_tags.contains(tag));
    if required_missing {
        hard_conflicts.push(ConflictCode::RequiredTagMissing);
    }
    if avoid_present {
        hard_conflicts.push(ConflictCode::AvoidTagPresent);
    }

    let required_score = if !required_missing && !avoid_present {
        weight * 2.0 / 3.0
    } else {
        0.0
    };
    let preferred_match_count = condition
        .preferred_tags
        .iter()
        .filter(|tag| candidate_tags.contains(tag))
        .count();
    let preferred_score = if condition.preferred_tags.is_empty() {
        weight / 3.0
    } else {
        weight / 3.0 * preferred_match_count as f64 / condition.preferred_tags.len() as f64
    };

    let mut reasons: Vec<String> = Vec::new();
    if !condition.required_tags.is_empty() {
        reasons.push(
            if required_missing {
                "필요한 특징 부족"
            } else {
                "필요한 특징 충족"
            }
            .to_string(),
        );
    }
    if avoid_present {
        reasons.push("피하고 싶은 특징 포함".to_string());
    }
    if !condition.preferred_tags.is_empty() {
        reasons.push(format!(
            "선호 특징 {preferred_match_count}/{}개 일치",
            condition.preferred_tags.len()
        ));
    }
    let reason = if reasons.is_empty() {
        "입력한 특징 없음".to_string()
    } else {
        reasons.join(" · ")
    };
    (required_score + preferred_score, reason)
}

fn candidate_reasons(submitted_responses: usize, expected_responses: usize) -> Vec<String> {
    if submitted_responses == expected_responses {
        vec![format!("{submitted_responses}명이 모두 의견을 남겼습니다.")]
    } else {
        vec![format!(
            "전체 {expected_responses}명 중 {submitted_responses}명이 의견을 남겼습니다."
        )]
    }
}
