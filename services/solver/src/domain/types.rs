#[derive(Debug, Clone)]
pub(crate) struct SolveInput {
    pub(crate) request_id: String,
    pub(crate) policy_version: String,
    pub(crate) scoring_profile: String,
    pub(crate) participants: Vec<Participant>,
    pub(crate) candidates: Vec<Candidate>,
}

#[derive(Debug, Clone)]
pub(crate) struct Participant {
    pub(crate) id: String,
    pub(crate) responses: Vec<ParticipantResponse>,
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
}
