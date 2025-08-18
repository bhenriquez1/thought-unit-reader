// lib/chunkers.ts

export type ChunkMode = "sentence" | "semantic" | "bullet-first";

/** Stable id for a chunk (whitespace + case insensitive) */
export function stableChunkId(text: string): string {
  const t = (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  // fast 32-bit FNV-like hash -> base36 string
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
}

/** Idea-sized chunker with a target character budget */
export function chunkText(
  raw: string,
  { mode = "semantic", targetChars = 260 }: { mode?: ChunkMode; targetChars?: number }
): string[] {
  const T = (raw || "").replace(/\s+/g, " ").trim();
  if (!T) return [];

  // --- 1) seed units -------------------------------------------------------
  let units: string[] = [];

  if (mode === "bullet-first") {
    // prefer explicit bullets if the passage looks like a list
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => /^([-*•\u2022]|\d+\.)\s+/.test(l));
    if (bullets.length >= 2) {
      units = bullets.map((b) => b.replace(/^([-*•\u2022]|\d+\.)\s+/, "").replace(/\s+/g, " ").trim());
    }
  }

  if (!units.length) {
    // conservative sentence split
    units = T.split(/(?<=[.?!])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);
    if (!units.length) units = [T];
  }

  if (mode === "sentence") {
    // optionally break very long sentences on strong punctuation
    return units.flatMap((s) => s.split(/\s*(?:;|:|—|–|--)\s*/).filter(Boolean));
  }

  // --- 2) semantic stitches (join neighbors up to targetChars) ------------
  const out: string[] = [];
  let buf = "";

  const push = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
  };

  // phrases we’re okay joining across even if long-ish
  const isConnector = (s: string) =>
    /^(however|therefore|thus|because|first|next|then|finally|whereas|in contrast|moreover|additionally)\b/i.test(
      s
    );

  for (const u0 of units) {
    // micro-split a unit on clause punctuation/conjunctions
    const parts = u0
      .split(/\s*(?:;|:|—|–|--|, and |, but | and | but | however | whereas )\s*/i)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const p of parts) {
      if (!buf) {
        buf = p;
        continue;
      }
      const joined = `${buf} ${p}`;
      if (joined.length <= targetChars * 1.1 || isConnector(p)) {
        buf = joined;
      } else {
        push();
        buf = p;
      }
    }
  }
  push();

  // --- 3) sanity merge if everything is too short --------------------------
  if (out.length > 1 && out.every((c) => c.length < targetChars * 0.35)) {
    const merged: string[] = [];
    for (let i = 0; i < out.length; i += 2) {
      merged.push(out[i + 1] ? `${out[i]} ${out[i + 1]}` : out[i]);
    }
    return merged;
  }

  return out;
}