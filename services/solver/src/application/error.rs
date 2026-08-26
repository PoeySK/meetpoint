use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SolveErrorCode {
    InvalidSchema,
    NoParticipants,
    NoCandidates,
    InvalidTimeRange,
    ResponseFieldMissing,
    ConditionMissing,
    InvalidCondition,
}

impl SolveErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidSchema => "INVALID_SCHEMA",
            Self::NoParticipants => "NO_PARTICIPANTS",
            Self::NoCandidates => "NO_CANDIDATES",
            Self::InvalidTimeRange => "INVALID_TIME_RANGE",
            Self::ResponseFieldMissing => "RESPONSE_FIELD_MISSING",
            Self::ConditionMissing => "CONDITION_MISSING",
            Self::InvalidCondition => "INVALID_CONDITION",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SolveError {
    pub code: SolveErrorCode,
    pub message: String,
    pub details: Value,
}

impl SolveError {
    pub(crate) fn schema(message: &str, details: Value) -> Self {
        Self {
            code: SolveErrorCode::InvalidSchema,
            message: message.to_string(),
            details,
        }
    }

    pub(crate) fn unprocessable(code: SolveErrorCode, message: &str, details: Value) -> Self {
        Self {
            code,
            message: message.to_string(),
            details,
        }
    }
}

pub type SolverError = SolveError;
