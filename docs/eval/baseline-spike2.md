# Apprentice eval

## ps1_buttons spike 2 run A

Three cases per step: correct (mid-step frames), skipped ahead, not started.

21 cases, exact-verdict accuracy 43%.

| Verdict | Labelled | Predicted | Precision | Recall | F1  |
| ------- | -------- | --------- | --------- | ------ | --- |
| done    | 7        | 5         | 40%       | 29%    | 33% |
| not_yet | 7        | 13        | 46%       | 86%    | 60% |
| wrong   | 0        | 2         | 0%        | n/a    | n/a |
| skipped | 7        | 1         | 100%      | 14%    | 25% |

**Coach gate** (pass confidence 0.8): pass rate 29% (target 85%), catch rate 79% (target 90%), 3 false passes, 0 false unsafe stops (target 0).

| Pass confidence | Pass rate | Catch rate | False passes |
| --------------- | --------- | ---------- | ------------ |
| 0.6             | 29%       | 79%        | 3            |
| 0.7             | 29%       | 79%        | 3            |
| 0.8             | 29%       | 79%        | 3            |
| 0.9             | 0%        | 86%        | 2            |
| 0.95            | 0%        | 93%        | 1            |

## ps1_buttons spike 2 run B

Is the step finished? Frames from the end and the start of each step.

16 cases, exact-verdict accuracy 44%.

| Verdict | Labelled | Predicted | Precision | Recall | F1  |
| ------- | -------- | --------- | --------- | ------ | --- |
| done    | 8        | 2         | 100%      | 25%    | 40% |
| not_yet | 8        | 10        | 50%       | 63%    | 56% |
| wrong   | 0        | 1         | 0%        | n/a    | n/a |
| skipped | 0        | 3         | 0%        | n/a    | n/a |

**Coach gate** (pass confidence 0.8): pass rate 25% (target 85%), catch rate 100% (target 90%), 0 false passes, 0 false unsafe stops (target 0).

_No confidences recorded for this run, so no threshold sweep._

## Cost

Muse Spark judge: $0.0093 per call (mean of 21 recorded calls).

Verifying continuously at one sample every 1500 ms would cost $0.3728 per minute (budget $0.05 per coaching minute). Checks should run only when the trainee says done, a few samples each.
