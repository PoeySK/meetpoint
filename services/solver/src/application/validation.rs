use crate::{
    application::error::{SolveError, SolveErrorCode},
    contract::SolveRequest,
    domain::{
        policy::{ScoringPolicy, policy_for},
        types::{
            AvailabilityStatus, AvailabilityWindow, Candidate, Participant, ParticipantCondition,
            ParticipantResponse, SolveInput, TravelBurden,
        },
    },
};
use serde_json::json;
use std::collections::HashSet;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

pub(crate) fn validate_request(request: &SolveRequest) -> Result<SolveInput, SolveError> {
    let policy = validate_header(request)?;

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
    let participants = validate_participants(request, &candidate_ids, policy)?;
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
        policy,
    })
}

fn validate_header(request: &SolveRequest) -> Result<ScoringPolicy, SolveError> {
    if request.request_id.trim().is_empty()
        || request.policy_version.trim().is_empty()
        || request.room_id.trim().is_empty()
    {
        return Err(SolveError::schema(
            "requestId, policyVersion, and roomId are required",
            json!({}),
        ));
    }
    let policy = policy_for(&request.policy_version, &request.scoring_profile);
    if policy.is_none() {
        return Err(SolveError::schema(
            "unsupported policyVersion",
            json!({
                "policyVersion": request.policy_version,
                "scoringProfile": request.scoring_profile
            }),
        ));
    }

    Ok(policy.expect("validated policy"))
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
    policy: ScoringPolicy,
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

        let condition = if policy.condition_aware {
            Some(validate_condition(
                participant,
                &participant.participant_id,
            )?)
        } else {
            None
        };
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
            condition,
        });
    }

    Ok(participants)
}

fn to_domain_candidate(candidate: &crate::contract::SolverCandidate) -> Candidate {
    Candidate {
        id: candidate.candidate_id.clone(),
        display_order: candidate.display_order,
        starts_at: parse_timestamp(&candidate.time.starts_at).expect("validated start time"),
        ends_at: parse_timestamp(&candidate.time.ends_at).expect("validated end time"),
        estimated_cost_per_person_krw: candidate.estimated_cost_per_person_krw,
        tags: candidate.tags.clone(),
    }
}

fn validate_condition(
    participant: &crate::contract::SolverParticipant,
    participant_id: &str,
) -> Result<ParticipantCondition, SolveError> {
    let condition = participant.condition.as_ref().ok_or_else(|| {
        SolveError::unprocessable(
            SolveErrorCode::ConditionMissing,
            "participant condition is required",
            json!({ "participantId": participant_id }),
        )
    })?;

    if condition.availability_windows.is_empty() || condition.availability_windows.len() > 10 {
        return Err(SolveError::unprocessable(
            SolveErrorCode::InvalidCondition,
            "participant availability windows are invalid",
            json!({ "participantId": participant_id }),
        ));
    }

    let availability_windows = condition
        .availability_windows
        .iter()
        .map(|window| {
            let starts_at = parse_timestamp(&window.starts_at);
            let ends_at = parse_timestamp(&window.ends_at);
            match (starts_at, ends_at) {
                (Some(starts_at), Some(ends_at)) if ends_at > starts_at => {
                    Ok(AvailabilityWindow { starts_at, ends_at })
                }
                _ => Err(SolveError::unprocessable(
                    SolveErrorCode::InvalidCondition,
                    "participant availability window is invalid",
                    json!({ "participantId": participant_id }),
                )),
            }
        })
        .collect::<Result<Vec<_>, _>>()?;

    if condition.max_budget_krw.is_some_and(|value| value < 0) {
        return Err(SolveError::unprocessable(
            SolveErrorCode::InvalidCondition,
            "participant max budget is invalid",
            json!({ "participantId": participant_id }),
        ));
    }

    validate_tags(&condition.preferences.required_tags, participant_id)?;
    validate_tags(&condition.preferences.preferred_tags, participant_id)?;
    validate_tags(&condition.preferences.avoid_tags, participant_id)?;
    let all_tags = condition
        .preferences
        .required_tags
        .iter()
        .chain(condition.preferences.preferred_tags.iter())
        .chain(condition.preferences.avoid_tags.iter())
        .collect::<Vec<_>>();
    if all_tags.iter().collect::<HashSet<_>>().len() != all_tags.len() {
        return Err(SolveError::unprocessable(
            SolveErrorCode::InvalidCondition,
            "participant preference tags must be unique",
            json!({ "participantId": participant_id }),
        ));
    }

    Ok(ParticipantCondition {
        availability_windows,
        max_budget_krw: condition.max_budget_krw,
        required_tags: condition.preferences.required_tags.clone(),
        preferred_tags: condition.preferences.preferred_tags.clone(),
        avoid_tags: condition.preferences.avoid_tags.clone(),
    })
}

fn validate_tags(tags: &[String], participant_id: &str) -> Result<(), SolveError> {
    if tags.len() > 10
        || tags
            .iter()
            .any(|tag| tag.trim().is_empty() || tag.len() > 50)
        || tags.iter().collect::<HashSet<_>>().len() != tags.len()
    {
        return Err(SolveError::unprocessable(
            SolveErrorCode::InvalidCondition,
            "participant preference tags are invalid",
            json!({ "participantId": participant_id }),
        ));
    }

    Ok(())
}

fn parse_timestamp(value: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(value, &Rfc3339).ok()
}
