use axum::{
    Router,
    extract::{Json, rejection::JsonRejection},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use serde::Serialize;
use serde_json::{Value, json};
use solver::{POLICY_VERSION, SCORING_PROFILE, SolveRequest, SolverError, solve};
use std::{env, error::Error, net::SocketAddr};
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
    error: SolverError,
) -> (StatusCode, Json<SolverFailureResponse>) {
    (
        StatusCode::from_u16(error.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        Json(SolverFailureResponse {
            request_id,
            policy_version,
            scoring_profile,
            status: "FAILED",
            error: SolverErrorBody {
                code: error.code.to_string(),
                message: error.message,
                retryable: error.retryable,
                details: error.details,
            },
        }),
    )
}

async fn solve_handler(payload: Result<Json<SolveRequest>, JsonRejection>) -> impl IntoResponse {
    let request = match payload {
        Ok(Json(request)) => request,
        Err(_) => {
            return failure_response(
                "req_unknown".to_string(),
                POLICY_VERSION.to_string(),
                SCORING_PROFILE.to_string(),
                SolverError {
                    status: 400,
                    code: "INVALID_JSON",
                    message: "request body must be valid JSON".to_string(),
                    retryable: false,
                    details: json!({}),
                },
            )
            .into_response();
        }
    };

    let request_id = request.request_id.clone();
    let policy_version = request.policy_version.clone();
    let scoring_profile = request.scoring_profile.clone();
    match solve(request) {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) => {
            failure_response(request_id, policy_version, scoring_profile, error).into_response()
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let port = env::var("SOLVER_PORT")
        .or_else(|_| env::var("PORT"))
        .unwrap_or_else(|_| "4000".to_string())
        .parse::<u16>()?;
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/solve", post(solve_handler));
    let listener = tokio::net::TcpListener::bind(address).await?;

    println!("MeetPoint Solver listening on http://{address}");
    axum::serve(listener, app).await?;

    Ok(())
}
