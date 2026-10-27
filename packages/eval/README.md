# @apprentice/eval

Measures whether the coach lets the right steps through, and what that costs.

- `scoreVerdicts`: exact-match precision, recall and F1 per verdict kind, with a confusion matrix.
- `gateMetrics`: the coach's real question, "would this let the trainee advance?". Pass rate (target >= 85%), catch rate (target >= 90%), false passes, false unsafe stops (target 0). Reports split these by case origin.
- `sweepPassConfidence`: gate metrics across thresholds, to tune `CoachPolicy.passConfidence`.
- `syntheticCases`, `recordingCases`: build an `EvalSet` from a guide and its expert video, or from a person's labels on a trainee recording (`RecordingLabels`, exported by the `/lab` page).
- `runEvalSet`: judges every case through the same `VisionReasoner.judgeStep` the live coach uses, with the expert's reference frames.
- `compareReport`: before and after on the same cases, listing every case whose gate outcome changed.
- `costPerGuide`, `costPerCoachingMinute`: from metered `UsageEvent`s (budget: <= $1 per guide, <= $0.05 per coaching minute).

```bash
pnpm --filter @apprentice/eval build
cd packages/eval
node dist/cli.js report                                   # the recorded spike-2 runs, free
node dist/cli.js set synth --guide guide.json --video expert.mp4 --out synth.json
node dist/cli.js set from-labels --guide guide.json --expert expert.mp4 \
  --trainee trainee.mp4 --labels labels.json --out rec.json
node dist/cli.js run --set rec.json --out run.json --cap 1 --yes-spend   # James's machine only
node dist/cli.js report run.json
node dist/cli.js compare run-before.json run-after.json
```

`guide.json` is a guide as `GET /guides/:id` on the API returns it. Only `run` can call a model. It refuses a live run without `--yes-spend`, stops at `--cap` dollars, and every request goes through the request-hash cache, so re-running a set (or replaying it with `APPRENTICE_ADAPTERS=replay`) costs nothing. With `APPRENTICE_ADAPTERS=fake` it runs against the fixtures, which is how the CLI is tested here.

Synthetic cases come from the expert's own video, so they share its camera and hands and score optimistically; they have no skip cases, because every step in the expert video really was done. Recording cases are the gold standard: done, skipped and wrong come from a person watching a real attempt.

A labelled run is `{ "name", "cases": [{ "id", "stepIndex", "label", "origin"?, "predicted": { "kind", "confidence"?, "sentence"? } }] }`. The baseline is in `docs/eval/baseline-spike2.md`.
