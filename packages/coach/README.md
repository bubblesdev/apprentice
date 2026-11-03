# @apprentice/coach

The live coaching engine. Pure where it matters, so every decision is testable and replayable.

| Module        | What it does                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `policy.ts`   | `CoachPolicy`: every threshold in one zod object                                                 |
| `decide.ts`   | `decide(samples, policy)`: pure verdict policy over the samples since the trainee asked to check |
| `machine.ts`  | `startSession`, `transition(context, event)`: verify-then-advance state machine                  |
| `verifier.ts` | `StepVerifier`: Muse Spark judges live frames against the expert; SAM 3.1 checks parts           |
| `report.ts`   | `buildReport(guide, session)`: per-step status, caught mistakes and evidence                     |

## Policy (defaults)

- Advance only on 2 consecutive `done` samples at confidence >= 0.8, with every grounded part visible (SAM confidence >= 0.5).
- `wrong` or `skipped` at >= 0.7: retry, with the model's evidence. `not_yet` at >= 0.7: back to doing.
- `unsafe` at >= 0.75: blocked until acknowledged. A weaker `unsafe` asks for a closer look; it never passes.
- Anything else (low confidence, `unclear`, a missing part, a model error): show me closer.
- After 3 closer requests in a row, or at once when the budget is spent, the trainee may confirm the step; the report marks it unverified.
- Steps with safety level `stop` open with a briefing the trainee must acknowledge.
