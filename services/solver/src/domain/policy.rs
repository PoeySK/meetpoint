pub const POLICY_VERSION: &str = "mvp-1";
pub const SCORING_PROFILE: &str = "MVP_NO_CONDITIONS";

#[derive(Debug, Clone, Copy)]
pub(crate) struct ScoringWeights {
    pub(crate) time: f64,
    pub(crate) travel_burden: f64,
    pub(crate) budget: f64,
    pub(crate) preference: f64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ScoringPolicy {
    pub(crate) policy_version: &'static str,
    pub(crate) scoring_profile: &'static str,
    pub(crate) weights: ScoringWeights,
}

pub(crate) const MVP_POLICY: ScoringPolicy = ScoringPolicy {
    policy_version: POLICY_VERSION,
    scoring_profile: SCORING_PROFILE,
    weights: ScoringWeights {
        time: 40.0,
        travel_burden: 25.0,
        budget: 20.0,
        preference: 15.0,
    },
};
