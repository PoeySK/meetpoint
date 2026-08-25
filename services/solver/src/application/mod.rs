mod error;
mod solve;
mod validation;

pub use error::{SolveError, SolveErrorCode, SolverError};
pub use solve::solve;

#[cfg(test)]
mod tests;
