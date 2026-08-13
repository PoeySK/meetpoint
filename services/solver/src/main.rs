use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::{env, error::Error, net::SocketAddr};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

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

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let port = env::var("SOLVER_PORT")
        .or_else(|_| env::var("PORT"))
        .unwrap_or_else(|_| "4000".to_string())
        .parse::<u16>()?;
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let app = Router::new().route("/health", get(health));
    let listener = tokio::net::TcpListener::bind(address).await?;

    println!("MeetPoint Solver listening on http://{address}");
    axum::serve(listener, app).await?;

    Ok(())
}
