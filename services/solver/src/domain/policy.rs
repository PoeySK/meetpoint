pub const POLICY_VERSION: &str = "mvp-1";
pub const SCORING_PROFILE: &str = "MVP_NO_CONDITIONS";
pub const CONDITION_AWARE_POLICY_VERSION: &str = "condition-aware-1";
pub const CONDITION_AWARE_SCORING_PROFILE: &str = "CONDITION_AWARE";

#[derive(Debug, Clone, Copy)]
pub(crate) struct ScoringWeights {
    pub(crate) time: f64,
    pub(crate) travel_burden: f64,
    pub(crate) budget: f64,
    pub(crate) preference: f64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ScoringPolicy {
    pub(crate) scoring_profile: &'static str,
    pub(crate) weights: ScoringWeights,
    pub(crate) condition_aware: bool,
}

pub(crate) const LEGACY_POLICY: ScoringPolicy = ScoringPolicy {
    scoring_profile: SCORING_PROFILE,
    weights: ScoringWeights {
        time: 40.0,
        travel_burden: 25.0,
        budget: 20.0,
        preference: 15.0,
    },
    condition_aware: false,
};

pub(crate) const CONDITION_AWARE_POLICY: ScoringPolicy = ScoringPolicy {
    scoring_profile: CONDITION_AWARE_SCORING_PROFILE,
    weights: ScoringWeights {
        time: 40.0,
        travel_burden: 25.0,
        budget: 20.0,
        preference: 15.0,
    },
    condition_aware: true,
};

pub(crate) fn policy_for(policy_version: &str, scoring_profile: &str) -> Option<ScoringPolicy> {
    match (policy_version, scoring_profile) {
        (POLICY_VERSION, SCORING_PROFILE) => Some(LEGACY_POLICY),
        (CONDITION_AWARE_POLICY_VERSION, CONDITION_AWARE_SCORING_PROFILE) => {
            Some(CONDITION_AWARE_POLICY)
        }
        _ => None,
    }
}
