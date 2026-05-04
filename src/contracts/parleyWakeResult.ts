import { z } from "zod";
import { schemaVersion } from "./common.ts";

export const ParleyWakeResultSchema = z
  .object({
    schema_version: schemaVersion("parley-wake-result/v1"),
    wake_id: z.string().min(1),
    status: z.enum(["completed", "deferred", "aborted"]),
    actions: z.array(z.unknown()).optional(),
    reason: z.string().optional(),
    duration_ms: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.status === "deferred" || value.status === "aborted") &&
      !value.reason
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: `reason required when status is ${value.status}`,
      });
    }
  });

export type ParleyWakeResult = z.infer<typeof ParleyWakeResultSchema>;
