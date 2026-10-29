# Low reasoning on the judge: 29 Oct 2026

One change: `JUDGE_REASONING_EFFORT=low` (Muse Spark `reasoning.effort` on step checks only). The judge prompt includes the orientation rule from the same day.

## Speed and cost

Measured on the same 10 cases (lawn tractor set), each call fresh, one at a time:

| Setting | Time per check | Cost per check |
| ------- | -------------- | -------------- |
| Default | 8.2 s          | $0.0082        |
| Low     | 4.8 s          | $0.0051        |

Across all 116 low-reasoning checks the average was 4.2 to 4.8 s. A coached step needs about two checks, so a live verdict should drop from the 15 to 20 s seen in the web app to roughly 8 to 10 s. That still needs confirming in the app.

## Accuracy

**90 synthetic cases** (the earlier default run used the 27 Oct prompt with the brand rule, without the orientation rule, so two things differ):

| Gate | Default: pass / catch / false passes | Low: pass / catch / false passes |
| ---- | ------------------------------------ | -------------------------------- |
| 0.8  | 73% / 79% / 12                       | 76% / 84% / 9                    |
| 0.9  | 58% / 84% / 9                        | 52% / 89% / 6                    |

**Same prompt, default against low** (the 10 lawn tractor cases plus the 26 laptop and air fryer cases, gate 0.8):

| Setting | Finished steps passed | Not-finished caught | False passes |
| ------- | --------------------- | ------------------- | ------------ |
| Default | 15                    | 14                  | 5            |
| Low     | 14                    | 16                  | 3            |

Three cases changed: two "earlier state" cases that default passed are now caught, and `hp-ram-open` went back to not_yet.

## Decision

Low is now the setting (`.env.example`). It is faster, cheaper and no less accurate. `passConfidence` stays 0.8 until a real gold set; 0.9 cuts false passes further but passes only about half of finished steps.

Cost: $0.67.
