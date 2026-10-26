# 0003: The model proposes, policy decides

Date: 2026-10-26. Status: accepted.
Context: spike 2 showed model verdicts are evidence-rich but can be wrong when inputs are poor; a wrong pass is worse than a request to look closer.
Decision: models return verdict + confidence + evidence; a deterministic policy (thresholds, two-sample agreement, required parts present) decides state transitions.
Consequences: behaviour is testable and tunable from eval data; the UI can always explain why it advanced or stopped.
