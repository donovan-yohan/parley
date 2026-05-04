import type { ZodTypeAny, z } from "zod";

export type FieldError = {
  path: string;
  message: string;
};

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldError[] };

export function safeParseWithFieldErrors<S extends ZodTypeAny>(
  schema: S,
  value: unknown,
): ParseResult<z.infer<S>> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const errors: FieldError[] = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return { ok: false, errors };
}
