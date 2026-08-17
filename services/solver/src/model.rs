use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const POLICY_VERSION: &str = "mvp-1";
pub const SCORING_PROFILE: &str = "MVP_NO_CONDITIONS";

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SolveRequest {
    pub request_id: String,
    pub policy_version: String,
    pub scoring_profile: String,
    pub room_id: String,
    pub participants: Vec<SolverParticipant>,
    pub candidates: Vec<SolverCandidate>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SolverParticipant {
    pub participant_id: String,
    pub responses: Vec<SolverResponse>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SolverResponse {
    pub candidate_id: String,
    pub availability_status: String,
    pub travel_burden: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SolverCandidate {
    pub candidate_id: String,
    pub display_order: i32,
    pub time: CandidateTime,
    pub place: CandidatePlace,
    pub estimated_cost_per_person_krw: i32,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CandidateTime {
    pub starts_at: String,
    pub ends_at: String,
    pub timezone: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CandidatePlace {
    pub name: String,
    pub address: String,
    pub area: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SolveResponse {
    pub request_id: String,
    pub policy_version: String,
    pub scoring_profile: String,
    pub status: &'static str,
    pub metadata: ScoringMetadata,
    pub recommendation_status: String,
    pub recommendation_warnings: Vec<String>,
    pub coverage: Coverage,
    pub ranking: Vec<String>,
    pub candidates: Vec<CandidateResult>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoringMetadata {
    pub scoring_profile: &'static str,
    pub weights: ScoringWeights,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoringWeights {
    pub time: f64,
    pub travel_burden: f64,
    pub budget: f64,
    pub preference: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub responded_participants: usize,
    pub total_participants: usize,
    pub submitted_responses: usize,
    pub expected_responses: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CandidateCoverage {
    pub submitted_responses: usize,
    pub expected_responses: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CandidateResult {
    pub candidate_id: String,
    pub rank: usize,
    pub overall_score: f64,
    pub eligible: bool,
    pub match_level: String,
    pub hard_conflict_count: usize,
    pub coverage: CandidateCoverage,
    pub participant_breakdown: Vec<ParticipantBreakdown>,
    pub reasons: Vec<String>,
    pub conflicts: Vec<Conflict>,
    pub blocking_issues: Vec<String>,
    pub explanation_flags: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantBreakdown {
    pub participant_id: String,
    pub score: f64,
    pub components: ScoreComponents,
    pub hard_conflicts: Vec<String>,
    pub blocking_issues: Vec<String>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoreComponents {
    pub time: f64,
    pub travel_burden: f64,
    pub budget: f64,
    pub preference: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub participant_id: String,
    pub code: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SolverError {
    pub status: u16,
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
    pub details: Value,
}

impl SolverError {
    pub(crate) fn validation(code: &'static str, message: &str, details: Value) -> Self {
        Self {
            status: 422,
            code,
            message: message.to_string(),
            retryable: false,
            details,
        }
    }
}
