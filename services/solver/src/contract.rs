use serde::{Deserialize, Serialize};

/// JSON input accepted by the solver HTTP API.
///
/// The wire contract intentionally keeps user-provided enum values as strings.
/// They are converted to typed domain values by the application validation
/// boundary so that the scoring core never has to handle unknown variants.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SolveRequest {
    #[serde(default)]
    pub request_id: String,
    #[serde(default)]
    pub policy_version: String,
    #[serde(default)]
    pub scoring_profile: String,
    #[serde(default)]
    pub room_id: String,
    #[serde(default)]
    pub participants: Vec<SolverParticipant>,
    #[serde(default)]
    pub candidates: Vec<SolverCandidate>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SolverParticipant {
    #[serde(default)]
    pub participant_id: String,
    #[serde(default)]
    pub responses: Vec<SolverResponse>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SolverResponse {
    #[serde(default)]
    pub candidate_id: String,
    #[serde(default)]
    pub availability_status: String,
    #[serde(default)]
    pub travel_burden: String,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SolverCandidate {
    #[serde(default)]
    pub candidate_id: String,
    #[serde(default)]
    pub display_order: i32,
    #[serde(default)]
    pub time: CandidateTime,
    #[serde(default)]
    pub place: CandidatePlace,
    #[serde(default)]
    pub estimated_cost_per_person_krw: i32,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CandidateTime {
    #[serde(default)]
    pub starts_at: String,
    #[serde(default)]
    pub ends_at: String,
    #[serde(default)]
    pub timezone: String,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CandidatePlace {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub address: String,
    #[serde(default)]
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
