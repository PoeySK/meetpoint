FROM rust:1.95.0-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/solver /usr/local/bin/solver
ENV SOLVER_PORT=4000
USER 65534:65534
EXPOSE 4000
CMD ["solver"]
