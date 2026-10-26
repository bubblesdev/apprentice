# 0002: Meta models behind ports

Date: 2026-10-26. Status: accepted.
Context: the product depends on Muse Spark, Muse Wonder, SAM 3.1, Voice Transcribe and Muse Image; an open-weight path (Muse Glimmer, Muse Spark Open) may replace some calls.
Decision: domain packages depend on small interfaces (VisionReasoner, Segmenter, Transcriber, Illustrator); packages/meta implements them against the Meta Model API.
Consequences: test doubles in unit tests, cheap model swaps, cost metering in one place.
