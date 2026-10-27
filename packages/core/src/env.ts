/**
 * Drops unset and blank variables, so `KEY=` in a copied `.env.example` means "not set" and falls
 * back to the schema's default or optional handling instead of failing a `min(1)` check.
 */
export function withoutBlankValues(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== "") out[key] = value;
  }
  return out;
}
