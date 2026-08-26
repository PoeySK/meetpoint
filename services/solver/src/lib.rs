mod application;
pub mod contract;
mod domain;

pub use application::{SolveError, SolveErrorCode, SolverError, solve};
pub use contract::{
    AvailabilityWindow, CandidatePlace, CandidateResult, CandidateTime, Conflict, Coverage,
    ParticipantBreakdown, ScoreComponents, ScoringMetadata, ScoringWeights, SolveRequest,
    SolveResponse, SolverCandidate, SolverCondition, SolverParticipant, SolverPreferences,
    SolverResponse,
};
pub use domain::policy::{
    CONDITION_AWARE_POLICY_VERSION, CONDITION_AWARE_SCORING_PROFILE, POLICY_VERSION,
    SCORING_PROFILE,
};
