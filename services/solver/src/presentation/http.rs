use axum::{
    Router,
    extract::{Json, rejection::JsonRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Serialize;
use serde_json::{Value, json};
use solver::{POLICY_VERSION, SCORING_PROFILE, SolveError, SolveErrorCode, SolveRequest, solve};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    timestamp: String,
}

async fn health() -> Json<HealthResponse> {
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .expect("RFC 3339 formatting should succeed");

    Json(HealthResponse {
        status: "ok",
        service: "solver",
        timestamp,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SolverErrorBody {
    code: String,
    message: String,
    retryable: bool,
    details: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SolverFailureResponse {
    request_id: String,
    policy_version: String,
    scoring_profile: String,
    status: &'static str,
    error: SolverErrorBody,
}

fn failure_response(
    request_id: String,
    policy_version: String,
    scoring_profile: String,
    error: SolveError,
) -> Response {
    (
        error_status(error.code),
        Json(SolverFailureResponse {
            request_id,
            policy_version,
            scoring_profile,
            status: "FAILED",
            error: SolverErrorBody {
                code: error.code.as_str().to_string(),
                message: error.message,
                retryable: false,
                details: error.details,
            },
        }),
    )
        .into_response()
}

fn invalid_json_response() -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(SolverFailureResponse {
            request_id: "req_unknown".to_string(),
            policy_version: POLICY_VERSION.to_string(),
            scoring_profile: SCORING_PROFILE.to_string(),
            status: "FAILED",
            error: SolverErrorBody {
                code: "INVALID_JSON".to_string(),
                message: "request body must be valid JSON".to_string(),
                retryable: false,
                details: json!({}),
            },
        }),
    )
        .into_response()
}

fn error_status(code: SolveErrorCode) -> StatusCode {
    match code {
        SolveErrorCode::InvalidSchema => StatusCode::BAD_REQUEST,
        SolveErrorCode::NoParticipants
        | SolveErrorCode::NoCandidates
        | SolveErrorCode::InvalidTimeRange
        | SolveErrorCode::ResponseFieldMissing => StatusCode::UNPROCESSABLE_ENTITY,
    }
}

async fn solve_handler(payload: Result<Json<SolveRequest>, JsonRejection>) -> Response {
    let request = match payload {
        Ok(Json(request)) => request,
        Err(_) => return invalid_json_response(),
    };

    let request_id = request.request_id.clone();
    let policy_version = request.policy_version.clone();
    let scoring_profile = request.scoring_profile.clone();
    match solve(request) {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) => failure_response(request_id, policy_version, scoring_profile, error),
    }
}

pub(crate) fn router() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/solve", post(solve_handler))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use serde_json::Value;
    use tower::ServiceExt;

    #[tokio::test]
    async fn returns_structured_error_for_invalid_json() {
        let response = router()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/solve")
                    .header("content-type", "application/json")
                    .body(Body::from("{"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = response_body_json(response).await;
        assert_eq!(body["error"]["code"], "INVALID_JSON");
        assert_eq!(body["status"], "FAILED");
    }

    #[tokio::test]
    async fn maps_missing_response_field_to_unprocessable_entity() {
        let body = json!({
            "requestId": "req_http",
            "policyVersion": POLICY_VERSION,
            "scoringProfile": SCORING_PROFILE,
            "roomId": "room_http",
            "participants": [{
                "participantId": "participant_1",
                "responses": [{
                    "candidateId": "candidate_1",
                    "availabilityStatus": "AVAILABLE"
                }]
            }],
            "candidates": [candidate_json()]
        });

        let response = router().oneshot(json_request(body)).await.unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let body = response_body_json(response).await;
        assert_eq!(body["error"]["code"], "RESPONSE_FIELD_MISSING");
    }

    #[tokio::test]
    async fn returns_completed_response_for_valid_request() {
        let body = json!({
            "requestId": "req_http",
            "policyVersion": POLICY_VERSION,
            "scoringProfile": SCORING_PROFILE,
            "roomId": "room_http",
            "participants": [{
                "participantId": "participant_1",
                "responses": [{
                    "candidateId": "candidate_1",
                    "availabilityStatus": "AVAILABLE",
                    "travelBurden": "EASY"
                }]
            }],
            "candidates": [candidate_json()]
        });

        let response = router().oneshot(json_request(body)).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response_body_json(response).await;
        assert_eq!(body["status"], "COMPLETED");
        assert_eq!(body["candidates"][0]["overallScore"], 100.0);
        assert_eq!(body["ranking"][0], "candidate_1");
    }

    fn json_request(value: Value) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri("/v1/solve")
            .header("content-type", "application/json")
            .body(Body::from(value.to_string()))
            .unwrap()
    }

    fn candidate_json() -> Value {
        json!({
            "candidateId": "candidate_1",
            "displayOrder": 1,
            "time": {
                "startsAt": "2026-09-01T10:00:00Z",
                "endsAt": "2026-09-01T12:00:00Z",
                "timezone": "Asia/Seoul"
            },
            "place": {
                "name": "Place",
                "address": "Address",
                "area": "Area"
            },
            "estimatedCostPerPersonKrw": 15000,
            "tags": []
        })
    }

    async fn response_body_json(response: Response) -> Value {
        let bytes = axum::body::to_bytes(response.into_body(), 16 * 1024)
            .await
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }
}
