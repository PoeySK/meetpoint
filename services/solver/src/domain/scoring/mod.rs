mod candidate;

use crate::domain::{policy::ScoringPolicy, types::SolveInput};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RecommendationStatus {
    Incomplete,
    FullMatch,
    PartialMatch,
    NoFullMatch,
}

impl RecommendationStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Incomplete => "INCOMPLETE",
            Self::FullMatch => "FULL_MATCH",
            Self::PartialMatch => "PARTIAL_MATCH",
            Self::NoFullMatch => "NO_FULL_MATCH",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RecommendationWarning {
    LowScore,
}

impl RecommendationWarning {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::LowScore => "LOW_SCORE",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MatchLevel {
    Full,
    Partial,
    Conflicted,
    Incomplete,
}

impl MatchLevel {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Full => "FULL",
            Self::Partial => "PARTIAL",
            Self::Conflicted => "CONFLICTED",
            Self::Incomplete => "INCOMPLETE",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConflictCode {
    TimeUnavailable,
    TravelBurdenHard,
}

impl ConflictCode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::TimeUnavailable => "TIME_UNAVAILABLE",
            Self::TravelBurdenHard => "TRAVEL_BURDEN_HARD",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BlockingIssue {
    MissingResponse,
}

impl BlockingIssue {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::MissingResponse => "MISSING_RESPONSE",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExplanationFlag {
    MaybeResponse,
    TravelBurdenUncertain,
    SelfReportedTravelBurden,
    MissingResponse,
    NoFullMatch,
}

impl ExplanationFlag {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::MaybeResponse => "MAYBE_RESPONSE",
            Self::TravelBurdenUncertain => "TRAVEL_BURDEN_UNCERTAIN",
            Self::SelfReportedTravelBurden => "SELF_REPORTED_TRAVEL_BURDEN",
            Self::MissingResponse => "MISSING_RESPONSE",
            Self::NoFullMatch => "NO_FULL_MATCH",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct Coverage {
    pub(crate) responded_participants: usize,
    pub(crate) total_participants: usize,
    pub(crate) submitted_responses: usize,
    pub(crate) expected_responses: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct CandidateCoverage {
    pub(crate) submitted_responses: usize,
    pub(crate) expected_responses: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct ScoreComponents {
    pub(crate) time: f64,
    pub(crate) travel_burden: f64,
    pub(crate) budget: f64,
    pub(crate) preference: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct ParticipantBreakdown {
    pub(crate) participant_id: String,
    pub(crate) score: f64,
    pub(crate) components: ScoreComponents,
    pub(crate) hard_conflicts: Vec<ConflictCode>,
    pub(crate) blocking_issues: Vec<BlockingIssue>,
    pub(crate) reasons: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct Conflict {
    pub(crate) participant_id: String,
    pub(crate) code: ConflictCode,
}

#[derive(Debug, Clone)]
pub(crate) struct ScoredCandidate {
    pub(crate) candidate_id: String,
    pub(crate) display_order: i32,
    pub(crate) raw_overall_score: f64,
    pub(crate) overall_score: f64,
    pub(crate) eligible: bool,
    pub(crate) match_level: MatchLevel,
    pub(crate) hard_conflict_count: usize,
    pub(crate) minimum_participant_score: f64,
    pub(crate) coverage: CandidateCoverage,
    pub(crate) participant_breakdown: Vec<ParticipantBreakdown>,
    pub(crate) reasons: Vec<String>,
    pub(crate) conflicts: Vec<Conflict>,
    pub(crate) blocking_issues: Vec<BlockingIssue>,
    pub(crate) explanation_flags: Vec<ExplanationFlag>,
}

#[derive(Debug, Clone)]
pub(crate) struct ScoringResult {
    pub(crate) recommendation_status: RecommendationStatus,
    pub(crate) recommendation_warnings: Vec<RecommendationWarning>,
    pub(crate) coverage: Coverage,
    pub(crate) ranking: Vec<String>,
    pub(crate) candidates: Vec<ScoredCandidate>,
}

pub(crate) fn score(input: &SolveInput, policy: ScoringPolicy) -> ScoringResult {
    let expected_responses = input
        .participants
        .len()
        .saturating_mul(input.candidates.len());
    let submitted_responses = input
        .participants
        .iter()
        .fold(0usize, |total, participant| {
            total.saturating_add(participant.responses.len())
        });
    let responded_participants = input
        .participants
        .iter()
        .filter(|participant| !participant.responses.is_empty())
        .count();

    let mut candidates = input
        .candidates
        .iter()
        .map(|candidate| candidate::score_candidate(candidate, &input.participants, policy))
        .collect::<Vec<_>>();

    candidates.sort_by(|left, right| {
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

    let recommendation_status = recommendation_status(&candidates);
    let mut recommendation_warnings = Vec::new();
    if recommendation_status != RecommendationStatus::Incomplete
        && candidates
            .iter()
            .map(|candidate| candidate.overall_score)
            .fold(0.0, f64::max)
            < 60.0
    {
        recommendation_warnings.push(RecommendationWarning::LowScore);
    }

    if recommendation_status == RecommendationStatus::NoFullMatch {
        for candidate in &mut candidates {
            push_unique(
                &mut candidate.explanation_flags,
                ExplanationFlag::NoFullMatch,
            );
        }
    }

    let ranking = candidates
        .iter()
        .map(|candidate| candidate.candidate_id.clone())
        .collect();

    ScoringResult {
        recommendation_status,
        recommendation_warnings,
        coverage: Coverage {
            responded_participants,
            total_participants: input.participants.len(),
            submitted_responses,
            expected_responses,
        },
        ranking,
        candidates,
    }
}

fn recommendation_status(candidates: &[ScoredCandidate]) -> RecommendationStatus {
    if candidates
        .iter()
        .any(|candidate| candidate.match_level == MatchLevel::Incomplete)
    {
        RecommendationStatus::Incomplete
    } else if candidates
        .iter()
        .any(|candidate| candidate.match_level == MatchLevel::Full)
    {
        RecommendationStatus::FullMatch
    } else if candidates
        .iter()
        .any(|candidate| candidate.match_level == MatchLevel::Partial)
    {
        RecommendationStatus::PartialMatch
    } else {
        RecommendationStatus::NoFullMatch
    }
}

pub(crate) fn round_score(value: f64) -> f64 {
    let factor = 10_f64;
    (value * factor).round() / factor
}

fn push_unique<T>(values: &mut Vec<T>, value: T)
where
    T: PartialEq,
{
    if !values.iter().any(|current| current == &value) {
        values.push(value);
    }
}
