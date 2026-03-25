export function sanitizeRenderText(
  input: string | string[] | null | undefined,
): string {
  if (!input) return "";

  if (Array.isArray(input)) {
    return input
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  return String(input).replace(/\s+/g, " ").trim();
}

export function splitParagraphs(raw: string): string[] {
  return raw
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
