import { MetaEnv } from "@apprentice/meta";
import { z } from "zod";

export const WorkerEnv = MetaEnv.extend({
  DATABASE_URL: z.string().min(1),
  /** Hard cap on Meta spend per guide build. */
  GUIDE_BUDGET_USD: z.coerce.number().positive().default(1.5),
});
export type WorkerEnv = z.infer<typeof WorkerEnv>;
