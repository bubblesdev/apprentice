# @apprentice/eval

Scores model verdicts against labelled runs. Makes no model calls.

- `scoreVerdicts`: exact-match precision, recall and F1 per verdict kind, with a confusion matrix.
- `gateMetrics`: the coach's real question, "would this let the trainee advance?". Pass rate (target >= 85%), catch rate (target >= 90%), false passes, false unsafe stops (target 0).
- `sweepPassConfidence`: gate metrics across thresholds, to tune `CoachPolicy.passConfidence`.
- `costPerGuide`, `costPerCoachingMinute`: from metered `UsageEvent`s (budget: <= $1 per guide, <= $0.05 per coaching minute).

```bash
pnpm --filter @apprentice/eval build
pnpm --filter @apprentice/eval report                  # the recorded spike-2 runs
pnpm --filter @apprentice/eval report my-run.json      # a LabelledRun file
```

A labelled run is `{ "name", "cases": [{ "id", "stepIndex", "label", "predicted": { "kind", "confidence"?, "sentence"? } }] }`. The baseline is in `docs/eval/baseline-spike2.md`.
