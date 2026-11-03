import type { CoachState } from "@apprentice/core";
import { describe, expect, it } from "vitest";
import {
  startSession,
  transition,
  type CoachContext,
  type CoachEvent,
  type MachineDeps,
} from "./machine.js";
import { CoachPolicy, DEFAULT_POLICY } from "./policy.js";
import { sample, smallGuide, tickingClock } from "./testing/builders.js";

function deps(policy = DEFAULT_POLICY): MachineDeps {
  return { guide: smallGuide(), policy, clock: tickingClock() };
}

function run(events: CoachEvent[], d: MachineDeps = deps()): CoachContext {
  let ctx = startSession({ id: "sess1", guide: smallGuide(), clock: d.clock });
  for (const event of events) {
    const result = transition(ctx, event, d);
    if (!result.ok) throw new Error(result.reason);
    ctx = result.context;
  }
  return ctx;
}

const PASS: CoachEvent[] = [
  { type: "check" },
  {
    type: "sample",
    sample: sample("done", 0.9, { parts: [{ name: "Power cap", present: true }] }),
  },
  {
    type: "sample",
    sample: sample("done", 0.9, { parts: [{ name: "Power cap", present: true }] }),
  },
];

/** Contexts in every state, reached through real transitions. */
function contextIn(state: CoachState): CoachContext {
  const reach: Record<CoachState, CoachEvent[]> = {
    briefing: [],
    doing: [{ type: "begin" }],
    verifying: [{ type: "begin" }, { type: "check" }],
    passed: [{ type: "begin" }, ...PASS],
    closer: [
      { type: "begin" },
      { type: "check" },
      { type: "sample", sample: sample("unclear", 0.5) },
    ],
    retry: [{ type: "begin" }, { type: "check" }, { type: "sample", sample: sample("wrong", 0.9) }],
    blocked: [
      { type: "begin" },
      { type: "check" },
      { type: "sample", sample: sample("unsafe", 0.9) },
    ],
    complete: [{ type: "end" }],
  };
  const ctx = run(reach[state]);
  expect(ctx.session.state).toBe(state);
  return ctx;
}

const EVENTS: CoachEvent[] = [
  { type: "begin" },
  { type: "check" },
  { type: "sample", sample: sample("done", 0.9) },
  { type: "next" },
  { type: "acknowledge" },
  { type: "override" },
  { type: "end" },
];

/** The specification: which events each state accepts. Written out, not derived from the code. */
const ALLOWED: Record<CoachState, CoachEvent["type"][]> = {
  briefing: ["begin", "end"],
  doing: ["check", "end"],
  verifying: ["sample", "end"],
  passed: ["next", "end"],
  closer: ["check", "end"], // override only after enough closer requests, tested below
  retry: ["check", "end"],
  blocked: ["acknowledge", "end"],
  complete: [],
};

describe("transition: every state and event", () => {
  const states = Object.keys(ALLOWED) as CoachState[];
  for (const state of states) {
    for (const event of EVENTS) {
      const allowed = ALLOWED[state].includes(event.type);
      it(`${state} + ${event.type} is ${allowed ? "accepted" : "refused"}`, () => {
        const result = transition(contextIn(state), event, deps());
        expect(result.ok).toBe(allowed);
        if (!result.ok) expect(result.reason).toMatch(event.type);
      });
    }
  }
});

describe("transition: verify-then-advance", () => {
  it("starts in a briefing and passes a step after two agreeing samples", () => {
    const ctx = run([{ type: "begin" }, ...PASS]);
    expect(ctx.session.state).toBe("passed");
    expect(ctx.session.verdicts).toHaveLength(1);
    expect(ctx.session.verdicts[0]).toMatchObject({
      stepIndex: 0,
      kind: "done",
      decidedBy: "policy",
      confidence: 0.9,
    });
  });

  it("stays verifying after one done sample and records nothing yet", () => {
    const ctx = run([{ type: "begin" }, ...PASS.slice(0, 2)]);
    expect(ctx.session.state).toBe("verifying");
    expect(ctx.session.verdicts).toEqual([]);
    expect(ctx.lastDecision).toMatchObject({ kind: "confirming", agreeing: 1 });
  });

  it("opens a stop-level safety step with a briefing to acknowledge", () => {
    const ctx = run([{ type: "begin" }, ...PASS, { type: "next" }]);
    expect(ctx.session).toMatchObject({ stepIndex: 1, state: "briefing" });
  });

  it("goes straight to doing on an ordinary step", () => {
    const d = deps(CoachPolicy.parse({ agreeingSamples: 1 }));
    const pass: CoachEvent[] = [{ type: "check" }, { type: "sample", sample: sample("done", 0.9) }];
    const ctx = run(
      [{ type: "begin" }, ...pass, { type: "next" }, { type: "begin" }, ...pass, { type: "next" }],
      d,
    );
    expect(ctx.session).toMatchObject({ stepIndex: 2, state: "doing" });
  });

  it("completes after the last step and sets endedAt", () => {
    const d = deps(CoachPolicy.parse({ agreeingSamples: 1 }));
    const pass: CoachEvent[] = [
      { type: "check" },
      { type: "sample", sample: sample("done", 0.9) },
      { type: "next" },
    ];
    const ctx = run([{ type: "begin" }, ...pass, { type: "begin" }, ...pass, ...pass], d);
    expect(ctx.session.state).toBe("complete");
    expect(ctx.session.endedAt).toBeDefined();
    expect(ctx.session.verdicts.map((v) => v.stepIndex)).toEqual([0, 1, 2]);
  });

  it("clears the sample window on each new check", () => {
    const ctx = run([
      { type: "begin" },
      { type: "check" },
      { type: "sample", sample: sample("done", 0.9) },
      { type: "sample", sample: sample("unclear", 0.4) },
      { type: "check" },
      { type: "sample", sample: sample("done", 0.9) },
    ]);
    expect(ctx.session.state).toBe("verifying");
    expect(ctx.samples).toHaveLength(1);
  });
});

describe("transition: catches", () => {
  it("sends a wrong step back with evidence", () => {
    const ctx = contextIn("retry");
    expect(ctx.session.verdicts.at(-1)).toMatchObject({
      kind: "wrong",
      evidence: { sentence: "wrong at 0.9" },
    });
    expect(ctx.lastDecision).toMatchObject({ kind: "retry", verdict: "wrong" });
  });

  it("returns to doing when the step is not finished yet", () => {
    const ctx = run([
      { type: "begin" },
      { type: "check" },
      { type: "sample", sample: sample("not_yet", 0.9) },
    ]);
    expect(ctx.session.state).toBe("doing");
    expect(ctx.session.verdicts.at(-1)?.kind).toBe("not_yet");
  });

  it("blocks on unsafe until acknowledged, then redoes the same step", () => {
    const blocked = contextIn("blocked");
    expect(blocked.session.verdicts.at(-1)?.kind).toBe("unsafe");
    const result = transition(blocked, { type: "acknowledge" }, deps());
    expect(result.ok && result.context.session).toMatchObject({ state: "doing", stepIndex: 0 });
  });

  it("keeps frames and part boxes as evidence on a pass", () => {
    const box = { x1: 1, y1: 2, x2: 3, y2: 4, w: 10, h: 10 };
    const parts = [{ name: "Power cap", present: true, box }];
    const ctx = run([
      { type: "begin" },
      { type: "check" },
      { type: "sample", sample: sample("done", 0.9, { parts, frameKeys: ["f1", "f2"] }) },
      { type: "sample", sample: sample("done", 0.95, { parts, frameKeys: ["f2", "f3"] }) },
    ]);
    const evidence = ctx.session.verdicts[0]?.evidence;
    expect(evidence?.frameKeys).toEqual(["f1", "f2", "f3"]);
    expect(evidence?.boxes).toEqual([
      { label: "Power cap", box },
      { label: "Power cap", box },
    ]);
  });
});

describe("transition: show me closer and override", () => {
  const closer: CoachEvent[] = [
    { type: "check" },
    { type: "sample", sample: sample("unclear", 0.4) },
  ];

  it("counts closer requests and allows an override only after the policy's limit", () => {
    const twice = run([{ type: "begin" }, ...closer, ...closer]);
    expect(twice.closerStreak).toBe(2);
    expect(transition(twice, { type: "override" }, deps()).ok).toBe(false);

    const thrice = run([{ type: "begin" }, ...closer, ...closer, ...closer]);
    const result = transition(thrice, { type: "override" }, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.session.state).toBe("passed");
    expect(result.verdict).toMatchObject({ kind: "done", decidedBy: "trainee", confidence: 0 });
  });

  it("resets the closer streak after any decisive outcome", () => {
    const ctx = run([
      { type: "begin" },
      ...closer,
      ...closer,
      { type: "check" },
      { type: "sample", sample: sample("wrong", 0.9) },
    ]);
    expect(ctx.closerStreak).toBe(0);
  });

  it("allows an override at once when the coach is unavailable (budget spent)", () => {
    const ctx = run([
      { type: "begin" },
      { type: "check" },
      {
        type: "sample",
        sample: sample("unclear", 0, { error: { kind: "budget", message: "cap" } }),
      },
    ]);
    expect(transition(ctx, { type: "override" }, deps()).ok).toBe(true);
  });
});

describe("startSession", () => {
  it("refuses an empty guide", () => {
    expect(() =>
      startSession({ id: "s", guide: { ...smallGuide(), steps: [] }, clock: tickingClock() }),
    ).toThrow();
  });

  it("is pure: the same events give the same session", () => {
    const events: CoachEvent[] = [{ type: "begin" }, ...PASS, { type: "next" }];
    expect(run(events)).toEqual(run(events));
  });
});
