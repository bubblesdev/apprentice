# Spike 1 results (26 Oct 2026)
Video: "How to Fix Sticking or Squeaking Buttons on the PlayStation 1" (Wikimedia Commons, CC BY 3.0), 7.7 min, re-encoded to 720p at 10 fps (4,638 frames).

## SAM 3.1 video tracking (concept prompts)
| Concept | Frames with hits | Distinct ids | Time |
|---|---|---|---|
| round button | 2,235 | 12 | 196 s |
| plastic bracket | 1,285 | 1 | 169 s |
| screwdriver | 196 | 2 | 190 s |
- Finds the right objects on clear frames (button cap held in hand, slider being greased, screw being driven). Some misfires (a moulded post labelled as a button) and ids fragment over a long clip (12 ids for buttons). Cost about $0.93 per concept at 10 fps.
- Takeaway: run SAM per step clip, not on the whole video; use box/point prompts from the expert's frames to lock identity.

## Muse Spark step split (video + audio)
10 sensible ordered steps with start/end times (confirm symptom, remove screws, remove Power cap, grease, reinstall, remove Open slider, grease slider, grease Open cap, reinstall and screw, test). Works well.

## Skipped-step check (14 sparse trainee frames, step 6 cut out)
Failed: the cut step 6 was marked "done", and 5 other steps were wrongly marked "skipped". Sparse random frames are not enough evidence.
- Takeaway: verify step by step. Compare the trainee's frames for the current step with the expert's reference frames for that step, plus SAM presence/position of the step's parts, before moving on. This is the core engineering of the product.

# Spike 2: per-step check against expert reference frames (26 Oct)
Muse Spark only, 3 expert frames + 3 trainee frames per call. Cost: $0.20 + $0.15.

Run A (3 cases per step): 9/21. "Not started yet" 6/7; "correct" 2/7 and "skipped" 1/7. Test design was partly unfair: "correct" used mid-step frames.

Run B (the live-coach question: is this step finished when the trainee says done?): 10/16.
- Not finished (start of step): 8/8 correct, with specific evidence ("Power cap still seated", "slider dry, no grease sheen").
- Finished (end of step): 2/8. Reading the evidence, most "failures" are right about the frames: the end-of-step frames still show greasing, one screw still loose, slider still in place. The step TIMES from the first pass are off, so "end of step" frames were not the finished state.
- Takeaway: the judge is strict and evidence-based; the weak link is step boundaries. Next: refine each step's end time (dense frames around the boundary, or SAM events like a part appearing/disappearing), then re-test with a real second recording of the same job (one correct run, one with a step skipped).

Credits used so far: about $4 of $150.
