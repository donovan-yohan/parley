import { z } from "zod";

export const ToolCatalogEntrySchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, "tool name lowercase snake_case (digits ok after first char), max 32"),
  authority: z.enum(["actor", "gm-only", "validator-only", "lifecycle"]),
  write_path: z.enum(["profile-private", "instance-public", "none"]),
  description: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).optional(),
  outputs: z.record(z.string(), z.unknown()).optional()
}).strict();

export const ToolCatalogSchema = z.array(ToolCatalogEntrySchema).min(1);

export type ToolCatalogEntry = z.infer<typeof ToolCatalogEntrySchema>;
export type ToolCatalog = z.infer<typeof ToolCatalogSchema>;
