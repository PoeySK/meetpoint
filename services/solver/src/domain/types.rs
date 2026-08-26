#[derive(Debug, Clone)]
pub(crate) struct SolveInput {
    pub(crate) request_id: String,
    pub(crate) policy_version: String,
    pub(crate) scoring_profile: String,
    pub(crate) participants: Vec<Participant>,
    pub(crate) candidates: Vec<Candidate>,
    pub(crate) policy: crate::domain::policy::ScoringPolicy,
}

#[derive(Debug, Clone)]
pub(crate) struct Participant {
    pub(crate) id: String,
    pub(crate) responses: Vec<ParticipantResponse>,
    pub(crate) condition: Option<ParticipantCondition>,
}

#[derive(Debug, Clone)]
pub(crate) struct ParticipantCondition {
    pub(crate) availability_windows: Vec<AvailabilityWindow>,
    pub(crate) max_budget_krw: Option<i32>,
    pub(crate) required_tags: Vec<String>,
    pub(crate) preferred_tags: Vec<String>,
    pub(crate) avoid_tags: Vec<String>,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct AvailabilityWindow {
    pub(crate) starts_at: time::OffsetDateTime,
    pub(crate) ends_at: time::OffsetDateTime,
}

#[derive(Debug, Clone)]
pub(crate) struct ParticipantResponse {
    pub(crate) candidate_id: String,
    pub(crate) availability: AvailabilityStatus,
    pub(crate) travel_burden: TravelBurden,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AvailabilityStatus {
    Available,
    Maybe,
    Unavailable,
}

impl AvailabilityStatus {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "AVAILABLE" => Some(Self::Available),
            "MAYBE" => Some(Self::Maybe),
            "UNAVAILABLE" => Some(Self::Unavailable),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TravelBurden {
    Easy,
    Normal,
    Hard,
}

impl TravelBurden {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "EASY" => Some(Self::Easy),
            "NORMAL" => Some(Self::Normal),
            "HARD" => Some(Self::Hard),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct Candidate {
    pub(crate) id: String,
    pub(crate) display_order: i32,
    pub(crate) starts_at: time::OffsetDateTime,
    pub(crate) ends_at: time::OffsetDateTime,
    pub(crate) estimated_cost_per_person_krw: i32,
    pub(crate) tags: Vec<String>,
}
