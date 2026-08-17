use crate::model::{SCORING_PROFILE, SolveRequest, SolverError};
use serde_json::json;
use std::collections::HashSet;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

pub(crate) fn validate_request(request: &SolveRequest) -> Result<(), SolverError> {
    if request.request_id.trim().is_empty() || request.policy_version.trim().is_empty() {
        return Err(SolverError::validation(
            "INVALID_SCHEMA",
            "requestId and policyVersion are required",
            json!({}),
        ));
    }
    if request.scoring_profile != SCORING_PROFILE {
        return Err(SolverError::validation(
            "INVALID_SCHEMA",
            "unsupported scoringProfile",
            json!({ "scoringProfile": request.scoring_profile }),
        ));
    }
    if request.participants.is_empty() {
        return Err(SolverError::validation(
            "NO_PARTICIPANTS",
            "at least one participant is required",
            json!({}),
        ));
    }
    if request.candidates.is_empty() {
        return Err(SolverError::validation(
            "NO_CANDIDATES",
            "at least one candidate is required",
            json!({}),
        ));
    }

    let mut participant_ids = HashSet::new();
    for participant in &request.participants {
        if participant.participant_id.trim().is_empty()
            || !participant_ids.insert(&participant.participant_id)
        {
            return Err(SolverError::validation(
                "INVALID_SCHEMA",
                "participant IDs must be non-empty and unique",
                json!({}),
            ));
        }
    }

    let mut candidate_ids = HashSet::new();
    for candidate in &request.candidates {
        if candidate.candidate_id.trim().is_empty()
            || !candidate_ids.insert(&candidate.candidate_id)
        {
            return Err(SolverError::validation(
                "INVALID_SCHEMA",
                "candidate IDs must be non-empty and unique",
                json!({}),
            ));
        }
        if candidate.display_order < 1
            || candidate.estimated_cost_per_person_krw < 0
            || candidate.time.timezone.trim().is_empty()
            || candidate.place.name.trim().is_empty()
            || candidate.place.address.trim().is_empty()
            || candidate.place.area.trim().is_empty()
        {
            return Err(SolverError::validation(
                "INVALID_SCHEMA",
                "candidate fields are invalid",
                json!({ "candidateId": candidate.candidate_id }),
            ));
        }
        let starts_at = parse_timestamp(&candidate.time.starts_at);
        let ends_at = parse_timestamp(&candidate.time.ends_at);
        if starts_at.is_none() || ends_at.is_none() || ends_at.unwrap() <= starts_at.unwrap() {
            return Err(SolverError::validation(
                "INVALID_TIME_RANGE",
                "candidate time range is invalid",
                json!({ "candidateId": candidate.candidate_id }),
            ));
        }
    }

    for participant in &request.participants {
        let mut response_ids = HashSet::new();
        for response in &participant.responses {
            if !candidate_ids.contains(&response.candidate_id)
                || !response_ids.insert(&response.candidate_id)
            {
                return Err(SolverError::validation(
                    "INVALID_SCHEMA",
                    "responses must reference unique known candidates",
                    json!({ "participantId": participant.participant_id }),
                ));
            }
            if !matches!(
                response.availability_status.as_str(),
                "AVAILABLE" | "MAYBE" | "UNAVAILABLE"
            ) || !matches!(response.travel_burden.as_str(), "EASY" | "NORMAL" | "HARD")
            {
                return Err(SolverError::validation(
                    "RESPONSE_FIELD_MISSING",
                    "response availabilityStatus and travelBurden are invalid",
                    json!({ "participantId": participant.participant_id }),
                ));
            }
        }
    }

    Ok(())
}

fn parse_timestamp(value: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(value, &Rfc3339).ok()
}
