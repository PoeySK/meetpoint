mod application;
pub mod contract;
mod domain;

pub use application::{SolveError, SolveErrorCode, SolverError, solve};
pub use contract::{
    CandidatePlace, CandidateResult, CandidateTime, Conflict, Coverage, ParticipantBreakdown,
    ScoreComponents, ScoringMetadata, ScoringWeights, SolveRequest, SolveResponse, SolverCandidate,
    SolverParticipant, SolverResponse,
};
pub use domain::policy::{POLICY_VERSION, SCORING_PROFILE};
