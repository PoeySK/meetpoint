use crate::{
    application::error::{SolveError, SolveErrorCode},
    contract::SolveRequest,
    domain::{
        policy::MVP_POLICY,
        types::{
            AvailabilityStatus, Candidate, Participant, ParticipantResponse, SolveInput,
            TravelBurden,
        },
    },
};
use serde_json::json;
use std::collections::HashSet;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

pub(crate) fn validate_request(request: &SolveRequest) -> Result<SolveInput, SolveError> {
    validate_header(request)?;

    if request.participants.is_empty() {
        return Err(SolveError::unprocessable(
            SolveErrorCode::NoParticipants,
            "at least one participant is required",
            json!({}),
        ));
    }
    if request.candidates.is_empty() {
        return Err(SolveError::unprocessable(
            SolveErrorCode::NoCandidates,
            "at least one candidate is required",
            json!({}),
        ));
    }

    let candidate_ids = validate_candidates(request)?;
    let participants = validate_participants(request, &candidate_ids)?;
    let candidates = request
        .candidates
        .iter()
        .map(to_domain_candidate)
        .collect::<Vec<_>>();

    Ok(SolveInput {
        request_id: request.request_id.clone(),
        policy_version: request.policy_version.clone(),
        scoring_profile: request.scoring_profile.clone(),
        participants,
        candidates,
    })
}

fn validate_header(request: &SolveRequest) -> Result<(), SolveError> {
    if request.request_id.trim().is_empty()
        || request.policy_version.trim().is_empty()
        || request.room_id.trim().is_empty()
    {
        return Err(SolveError::schema(
            "requestId, policyVersion, and roomId are required",
            json!({}),
        ));
    }
    if request.policy_version != MVP_POLICY.policy_version {
        return Err(SolveError::schema(
            "unsupported policyVersion",
            json!({ "policyVersion": request.policy_version }),
        ));
    }
    if request.scoring_profile != MVP_POLICY.scoring_profile {
        return Err(SolveError::schema(
            "unsupported scoringProfile",
            json!({ "scoringProfile": request.scoring_profile }),
        ));
    }

    Ok(())
}

fn validate_candidates(request: &SolveRequest) -> Result<HashSet<String>, SolveError> {
    let mut candidate_ids = HashSet::new();
    for candidate in &request.candidates {
        if candidate.candidate_id.trim().is_empty()
            || !candidate_ids.insert(candidate.candidate_id.clone())
            || candidate.display_order < 1
            || candidate.estimated_cost_per_person_krw < 0
            || candidate.time.timezone.trim().is_empty()
            || candidate.place.name.trim().is_empty()
            || candidate.place.address.trim().is_empty()
            || candidate.place.area.trim().is_empty()
        {
            return Err(SolveError::schema(
                "candidate fields are invalid",
                json!({ "candidateId": candidate.candidate_id }),
            ));
        }

        match (
            parse_timestamp(&candidate.time.starts_at),
            parse_timestamp(&candidate.time.ends_at),
        ) {
            (Some(starts_at), Some(ends_at)) if ends_at > starts_at => {}
            _ => {
                return Err(SolveError::unprocessable(
                    SolveErrorCode::InvalidTimeRange,
                    "candidate time range is invalid",
                    json!({ "candidateId": candidate.candidate_id }),
                ));
            }
        }
    }

    Ok(candidate_ids)
}

fn validate_participants(
    request: &SolveRequest,
    candidate_ids: &HashSet<String>,
) -> Result<Vec<Participant>, SolveError> {
    let mut participant_ids = HashSet::new();
    let mut participants = Vec::with_capacity(request.participants.len());

    for participant in &request.participants {
        if participant.participant_id.trim().is_empty()
            || !participant_ids.insert(participant.participant_id.clone())
        {
            return Err(SolveError::schema(
                "participant IDs must be non-empty and unique",
                json!({}),
            ));
        }

        let mut response_ids = HashSet::new();
        let mut responses = Vec::with_capacity(participant.responses.len());
        for response in &participant.responses {
            if !candidate_ids.contains(&response.candidate_id)
                || !response_ids.insert(response.candidate_id.clone())
            {
                return Err(SolveError::schema(
                    "responses must reference unique known candidates",
                    json!({ "participantId": participant.participant_id }),
                ));
            }

            let availability = AvailabilityStatus::parse(&response.availability_status);
            let travel_burden = TravelBurden::parse(&response.travel_burden);
            if availability.is_none() || travel_burden.is_none() {
                return Err(SolveError::unprocessable(
                    SolveErrorCode::ResponseFieldMissing,
                    "response availabilityStatus and travelBurden are invalid",
                    json!({ "participantId": participant.participant_id }),
                ));
            }

            responses.push(ParticipantResponse {
                candidate_id: response.candidate_id.clone(),
                availability: availability.expect("validated availability"),
                travel_burden: travel_burden.expect("validated travel burden"),
            });
        }

        participants.push(Participant {
            id: participant.participant_id.clone(),
            responses,
        });
    }

    Ok(participants)
}

fn to_domain_candidate(candidate: &crate::contract::SolverCandidate) -> Candidate {
    Candidate {
        id: candidate.candidate_id.clone(),
        display_order: candidate.display_order,
    }
}

fn parse_timestamp(value: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(value, &Rfc3339).ok()
}
