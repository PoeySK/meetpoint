# Calculation MVP Profile

The first calculation vertical slice uses `MVP_NO_CONDITIONS`.

## Input boundary

`Participant.condition` is not implemented, persisted, or synthesized into the
database. NestJS sends Rust Solver only the active candidates and stored
Participant responses.

The participant-specific inputs are:

- `availabilityStatus`: `AVAILABLE`, `MAYBE`, or `UNAVAILABLE`
- `travelBurden`: `EASY`, `NORMAL`, or `HARD`

The fixed `mvp-1` weights remain `40/25/20/15` for time, travel burden, budget,
and preference. Because this profile has no condition input, budget `20` and
preference `15` are internal unrestricted defaults. They are not user data and
are not written to Participant or any condition table.

`CONDITION_INCOMPLETE`, budget conflicts, and preference conflicts are not
produced by this profile. A future condition-aware profile can use the same
result shape with a different `scoringProfile`.

## Calculation lifecycle

`POST /api/v1/rooms/{roomId}/calculations` creates a `ScoreResult` with
`RUNNING` status and returns `202 Accepted`. NestJS performs the Solver call in
an in-process asynchronous task. The client polls the calculation result API.

- HOST only can start a calculation.
- A second calculation is rejected while the Room is `CALCULATING`.
- Success stores `COMPLETED` and changes the Room to `CALCULATED`.
- Timeout, connection failure, or invalid Solver output stores `FAILED` and
  changes the Room back to `OPEN`.
- No Queue or Redis is used in this prototype. If the NestJS process restarts,
  an in-flight calculation can stop in `RUNNING`; recovery is a future
  operational concern.

The calculation result metadata contains:

```json
{
  "scoringProfile": "MVP_NO_CONDITIONS",
  "weights": {
    "time": 40,
    "travelBurden": 25,
    "budget": 20,
    "preference": 15
  }
}
```
