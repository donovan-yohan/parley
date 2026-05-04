import { z } from "zod";
import { schemaVersion } from "./common.ts";

export const ParleyImageWakeResultSchema = z.object({
  schema_version: schemaVersion("parley-image-wake-result/v1"),
  wake_id: z.string().min(1),
  status: z.enum(["completed", "deferred", "aborted"]),
  image_markdown: z.string().optional(),
  image_path: z.string().optional(),
  reason: z.string().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.status === "deferred" || value.status === "aborted") && !value.reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: `reason required when status is ${value.status}`,
    });
  }
  if (value.status === "completed" && !value.image_markdown && !value.image_path) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["image_markdown"],
      message: "completed image wake requires image_markdown OR image_path",
    });
  }
});

export type ParleyImageWakeResult = z.infer<typeof ParleyImageWakeResultSchema>;
