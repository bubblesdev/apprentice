# Apprentice: project context (shareable)

Working name: Apprentice. Builder: James Olawale (solo software engineer: mobile, web, Node, TypeScript, Kotlin, Swift). Built for the Meta Global AI Developer Hackathon, 26 Oct to 4 Nov 2026.

## One line

Any instructions, whether a video, a manual or a help doc, become a live coach that watches you do the job through your phone camera and catches mistakes before they matter.

## The problem

Hands-on know-how is hard to transfer. People learn practical jobs from videos, manuals and experienced colleagues, but:

- A video or manual can't see what you are doing, so it can't tell you that you skipped a step, used the wrong part or are about to do something unsafe.
- Experts are scarce. Training a new technician, assembler or lab worker means an expert standing beside them for days.
- Companies write manuals and help docs that customers and staff don't follow, which creates support calls, technician visits, returns and rework.
  This exists in every country and every industry: repairs, equipment servicing, assembly, installation, lab bench work, kitchens, maintenance, consumer products.

## The product

1. **Turn any instructions into a guide.** Upload a video of someone doing the job, paste a direct video link, or add a manual, PDF, help-centre page or Markdown doc. The AI watches and reads it, then produces an ordered, step-by-step guide: what to do, which parts and tools, what "done correctly" looks like, and safety warnings. Each step is anchored to real frames from the source, with the relevant parts highlighted, plus a clean diagram per step.
2. **Coach live.** The user points their phone at their own work and starts the guide. The coach shows and says the current step, watches through the camera, and only moves on when it can see the step is done. It stops the user when a step is skipped, done wrong, or unsafe, and explains what it saw.
3. **Prove it.** At the end there is a report: every step passed or failed, with the camera frames as evidence. For companies this becomes training records and quality evidence.
4. **Improve.** Where many users fail the same step, the guide is flagged so the author can improve it.

## Who it is for

- Individuals: fix or assemble something yourself from any how-to (a radio, a bike brake, an appliance part) with a coach that watches you.
- Companies (first paying buyers): turn product manuals and support docs into live coaches for customers and field technicians; capture retiring experts' know-how; train new staff on hands-on procedures.

## Why AI, and why Meta's models

Each Meta model does real work:

- **Muse Spark** (multimodal, 1M-token context): watches the whole source video with its audio, reads long manuals, splits the job into steps, and judges each live step from camera frames against the expert's reference frames.
- **SAM 3.1** (segmentation and tracking in images and video): tracks each part and tool through the source video so every step has exact visual evidence, and checks part presence/position in the user's camera view.
- **Muse Voice Transcribe**: captures the expert's narration and the user's spoken questions hands-free.
- **Muse Image**: draws a clean diagram for each step from the real frames.
- **Muse Wonder** (stronger reasoning): final audit of a run, safety gating and guide improvement.
- Optional **Muse Glimmer / Muse Spark Open** (open weights): cheap, private, frequent checks ("is the part there?") on own infrastructure.

## What has been tested so far (day 1)

On a 7.7-minute Creative Commons repair video (fixing sticky buttons on a PlayStation 1):

- Muse Spark split the job into 10 correct, ordered steps with times.
- SAM 3.1 tracked the button, the slider bracket and the screwdriver on clear frames; identities fragment over long clips, so tracking should run per step.
- Per-step check: "this step is not finished yet" was detected 8/8 with specific evidence; "finished" was confirmed only 2/8, mostly because the step end-times from the first pass were off. Fixing step boundaries and testing with a real second recording (one correct run, one with a skipped step) is next.
  Total model cost so far: about $4.

## Closest existing products

- Siemens Opcenter: AI work instructions from expert videos, for factory process designers.
- PTC Vuforia Expert Capture + Step Check: AR-headset capture and visual inspection, enterprise.
- Roboflow-style assembly monitoring: fixed cameras trained per product.
- Guidde, Scribe: screen-based instructions only.
  Gap: one phone-only loop from any instructions (video or docs) to live, verified coaching, with no headset, no per-product model training and no manual authoring.

## Hackathon constraints

- Judged equally on impact, creative use of Meta models, technical depth, and demo (3-minute video). Bonus prizes include Best Agentic, Best Creative Build (Muse Image/Wonder), Best Open-Weight, Most Viral on X.
- Everything must be built during the hackathon, in a public GitHub repo, with a working product.
- Deadline: 4 Nov 2026, 9 PM ET.

## Product principles

- Premium, minimal, intuitive UI that feels native on iOS and Android, not like an old enterprise tool.
- Honest AI: every verdict shows its evidence; when unsure, it asks the user to show the part closer instead of guessing.
- Safety first: dangerous steps (mains electricity, gas, sharp or pressurised parts) are gated with clear warnings.
- Clean, reusable, open-source code that others can build on.

## Open questions for brainstorming

1. Best first market: companies with product manuals (B2B), field technicians, or consumers fixing things?
2. Best demo job: something universal, visual and safe, filmable at home in 2 minutes.
3. Product name (Apprentice is a working name).
4. How to make the live check feel magical but never wrong in the demo.
5. How to show real-world impact numbers within 9 days.
