mod presentation;

use std::{env, error::Error, net::SocketAddr};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let port = env::var("SOLVER_PORT")
        .or_else(|_| env::var("PORT"))
        .unwrap_or_else(|_| "4000".to_string())
        .parse::<u16>()?;
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let app = presentation::http::router();
    let listener = tokio::net::TcpListener::bind(address).await?;

    println!("MeetPoint Solver listening on http://{address}");
    axum::serve(listener, app).await?;

    Ok(())
}
