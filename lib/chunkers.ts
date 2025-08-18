// lib/chunkers.ts
export type ChunkMode = "sentence" | "semantic" | "bullet-first";
export function stableChunkId(text: string) {
  // quick 32-bit hash (stable across sessions)
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h.toString(36);
}

/** Idea-sized chunker with a target character budget */
export function chunkText(
  raw: string,
  { mode = "semantic", targetChars = 260 }: { mode?: ChunkMode; targetChars?: number }
): string[] {
  const T = (raw || "").replace(/\s+/g, " ").trim();
  if (!T) return [];

  // 1) seed units
  let units: string[] = [];
  if (mode === "bullet-first") {
    const bullets = raw.split(/\n(?:-|\*|\d+\.)\s+/).filter(Boolean);
    if (bullets.length > 1) units = bullets.map(s => s.replace(/\s+/g, " ").trim());
  }
  if (!units.length) {
    units = T.split(/(?<=[.?!])\s+(?=[A-Z(])/).map(s => s.trim()).filter(Boolean);
  }

  // 2) semantic stitches (join short neighbors up to targetChars)
  const out: string[] = [];
  let buf = "";
  const push = () => { if (buf.trim()) { out.push(buf.trim()); buf = ""; } };

  const isConnector = (s: string) => /^(however|therefore|so|thus|because|first|next|then|finally|whereas|in contrast)\b/i.test(s);

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!buf) { buf = u; continue; }

    const joined = `${buf} ${u}`;
    if (joined.length <= targetChars || isConnector(u)) {
      buf = joined;
    } else {
      push();
      buf = u;
    }
  }
  push();

  // 3) sanity: if everything is super short, merge adjacent
  if (out.length > 1 && out.every(c => c.length < targetChars * 0.35)) {
    const merged: string[] = [];
    for (let i = 0; i < out.length; i += 2) {
      merged.push(out[i + 1] ? `${out[i]} ${out[i + 1]}` : out[i]);
    }
    return merged;
  }

  return out;
}