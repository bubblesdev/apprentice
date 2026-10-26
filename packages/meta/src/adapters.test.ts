import { describe, expect, it } from "vitest";
import { MetaEnv, createMetaAdapters } from "./adapters.js";
import { CacheMissError } from "./cache.js";
import { FakeReasoner } from "./fake/index.js";
import { SparkReasoner } from "./spark.js";

describe("createMetaAdapters", () => {
  it("uses fixtures when no key is set", async () => {
    const adapters = await createMetaAdapters({ env: MetaEnv.parse({}) });
    expect(adapters.mode).toBe("fake");
    expect(adapters.reasoner).toBeInstanceOf(FakeReasoner);
  });

  it("goes live only with a key", async () => {
    const adapters = await createMetaAdapters({ env: MetaEnv.parse({ META_MODEL_API_KEY: "k" }) });
    expect(adapters.mode).toBe("live");
    expect(adapters.reasoner).toBeInstanceOf(SparkReasoner);
    await expect(
      createMetaAdapters({ env: MetaEnv.parse({ APPRENTICE_ADAPTERS: "live" }) }),
    ).rejects.toThrow(/KEY/);
  });

  it("replays recordings without a key and never calls out on a miss", async () => {
    const env = MetaEnv.parse({
      APPRENTICE_ADAPTERS: "replay",
      META_CACHE_DIR: "/nonexistent/apprentice-cache",
    });
    const adapters = await createMetaAdapters({ env });
    expect(adapters.mode).toBe("replay");
    await expect(
      adapters.reasoner.judgeStep({
        step: { title: "t", instruction: "i", doneWhen: "d" },
        reference: [],
        live: [],
      }),
    ).rejects.toBeInstanceOf(CacheMissError);
  });
});
