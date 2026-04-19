// lib/insights/buildCompressionRules.ts
// v3: stricter anti-dup + true synthesis pass.
//
// Goals:
// - current-page only inputs
// - always try for at least 3 distinct rules
// - reject copied / lightly reworded concept-block text
// - prefer role-balanced rules:
//   1. recognition / identity
//   2. mechanism / logic
//   3. application / consequence / boundary
// - universal for all books

export type CompressionRole =
  | "recognition"
  | "mechanism"
  | "application"
  | "boundary";

export type CompressionSource =
  | "summary"
  | "block_pattern"
  | "block_reason"
  | "block_rule"
  | "block_trap"
  | "neighborhood_anchor"
  | "neighborhood_support"
  | "synthesized";

export interface CompressionConceptBlock {
  id: string;
  title: string;
  pattern?: string | null;
  reason?: string | null;
  trap?: string | null;
  rule?: string | null;
  importance?: string | null;
}

export interface CompressionNeighborhood {
  id: string;
  title?: string | null;
  anchor?: string | null;
  support?: string[];
  additional?: string[];
  trap?: string | null;
}

export interface BuildCompressionRulesInput {
  pageKey?: string | null;
  pageTitle?: string | null;
  pageSummary?: string | null;
  conceptBlocks: CompressionConceptBlock[];
  supportNeighborhoods?: CompressionNeighborhood[];
  minRules?: number;
}

export interface CompressionRule {
  id: string;
  text: string;
  role: CompressionRole;
  score: number;
  source: CompressionSource;
}

export interface BuildCompressionRulesResult {
  pageKey?: string | null;
  rules: CompressionRule[];
  rejected: CompressionRule[];
}

interface CandidateSeed {
  id: string;
  text: string;
  role: CompressionRole;
  score: number;
  source: CompressionSource;
}

/* -------------------------------------------------------------------------- */
/*                                   PUBLIC                                   */
/* -------------------------------------------------------------------------- */

export function buildCompressionRules(
  input: BuildCompressionRulesInput
): BuildCompressionRulesResult {
  const minRules = Math.max(3, input.minRules ?? 3);
  const protectedTexts = collectProtectedTexts(input);
  const rawCandidates = collectCandidates(input);
  const normalizedCandidates = dedupeCandidates(rawCandidates);

  const selected: CompressionRule[] = [];
  const rejected: CompressionRule[] = [];

  const roleOrder: CompressionRole[] = ["recognition", "mechanism", "application", "boundary"];

  // Pass 1: one best distinct candidate per role
  for (const role of roleOrder) {
    const roleCandidates = normalizedCandidates
      .filter((c) => c.role === role)
      .sort((a, b) => b.score - a.score);
    const picked = selectDistinctCandidate(roleCandidates, selected, protectedTexts, role);
    if (picked) {
      selected.push(materializeRule(picked, selected.length + 1));
    } else {
      rejected.push(...roleCandidates.map((c) => materializeRule(c, rejected.length + 100)));
    }
  }

  // Pass 2: backfill with strongest distinct candidate regardless of role
  const remaining = normalizedCandidates
    .filter((c) => !selected.some((s) => s.id === c.id))
    .sort((a, b) => b.score - a.score);

  for (const candidate of remaining) {
    if (selected.length >= minRules) break;
    if (passesStrictAntiDup(candidate.text, selected.map((s) => s.text), protectedTexts, candidate.role, selected)) {
      selected.push(materializeRule(candidate, selected.length + 1));
    } else {
      rejected.push(materializeRule(candidate, rejected.length + 100));
    }
  }

  // Pass 3: synthesize true page-level rules if still underfilled
  const synthesizedPool = buildSynthesizedCandidates(input, protectedTexts, selected);
  for (const candidate of synthesizedPool) {
    if (selected.length >= minRules) break;
    if (passesStrictAntiDup(candidate.text, selected.map((s) => s.text), protectedTexts, candidate.role, selected)) {
      selected.push(materializeRule(candidate, selected.length + 1));
    } else {
      rejected.push(materializeRule(candidate, rejected.length + 100));
    }
  }

  // Pass 4: emergency — force minimum, relax inter-rule threshold
  if (selected.length < minRules) {
    const emergencyPool = [...remaining, ...synthesizedPool]
      .filter((c) => !selected.some((s) => s.id === c.id))
      .sort((a, b) => b.score - a.score);
    for (const candidate of emergencyPool) {
      if (selected.length >= minRules) break;
      if (isDistinctEnough(candidate.text, selected.map((s) => s.text), 0.82)) {
        selected.push(materializeRule(candidate, selected.length + 1));
      }
    }
  }

  // Pass 5: synthesis guarantee — always swap the lowest-scoring block rule for
  // the best synthesized candidate. Synthesis bias (+0.05) ensures synthesized
  // rules outrank copied block rules when quality is similar.
  const hasSynthesized = selected.some((r) => r.source === "synthesized");
  if (!hasSynthesized && selected.length > 0) {
    const synthPool = buildSynthesizedCandidates(input, protectedTexts, []);
    // Apply +0.05 score bias so synthesized candidates consistently outrank block copies
    const biasedPool = synthPool.map((c) => ({ ...c, score: c.score + 0.05 }));
    // Use a permissive 0.50 threshold — always swap unless the synthesized text is
    // essentially identical to an already-selected rule
    const bestSynth = biasedPool
      .sort((a, b) => b.score - a.score)
      .find((c) => isDistinctEnough(c.text, selected.map((s) => s.text), 0.50));
    if (bestSynth) {
      const worstIdx = selected.reduce(
        (minI, r, i) => (r.score < selected[minI].score ? i : minI),
        0
      );
      rejected.push(selected[worstIdx]);
      selected[worstIdx] = materializeRule(bestSynth, worstIdx + 1);
    }
  }

  return {
    pageKey: input.pageKey ?? null,
    rules: selected.slice(0, Math.max(minRules, selected.length)),
    rejected,
  };
}

/* -------------------------------------------------------------------------- */
/*                             CANDIDATE COLLECTION                           */
/* -------------------------------------------------------------------------- */

function collectCandidates(input: BuildCompressionRulesInput): CandidateSeed[] {
  const out: CandidateSeed[] = [];

  if (isRenderableSentence(input.pageSummary)) {
    out.push({ id: "summary", text: input.pageSummary!.trim(), role: "recognition", score: 0.74, source: "summary" });
  }

  for (const block of input.conceptBlocks) {
    if (isRenderableSentence(block.pattern))
      out.push({ id: `${block.id}:pattern`, text: sanitizeSentence(block.pattern!), role: "recognition", score: 0.76, source: "block_pattern" });
    if (isRenderableSentence(block.reason))
      out.push({ id: `${block.id}:reason`, text: sanitizeSentence(block.reason!), role: "mechanism", score: 0.80, source: "block_reason" });
    if (isRenderableSentence(block.rule))
      out.push({ id: `${block.id}:rule`, text: sanitizeSentence(block.rule!), role: "application", score: 0.78, source: "block_rule" });
    if (isRenderableSentence(block.trap))
      out.push({ id: `${block.id}:trap`, text: normalizeTrapToBoundary(block.trap!), role: "boundary", score: 0.70, source: "block_trap" });
  }

  for (const neighborhood of input.supportNeighborhoods ?? []) {
    if (isRenderableSentence(neighborhood.anchor))
      out.push({ id: `${neighborhood.id}:anchor`, text: sanitizeSentence(neighborhood.anchor!), role: "recognition", score: 0.68, source: "neighborhood_anchor" });
    for (const [i, support] of (neighborhood.support ?? []).entries()) {
      if (!isRenderableSentence(support)) continue;
      out.push({ id: `${neighborhood.id}:support:${i}`, text: sanitizeSentence(support), role: inferRoleFromSentence(support), score: Math.max(0.5, 0.65 - i * 0.03), source: "neighborhood_support" });
    }
  }

  return out;
}

function buildSynthesizedCandidates(
  input: BuildCompressionRulesInput,
  protectedTexts: string[],
  selected: CompressionRule[]
): CandidateSeed[] {
  const out: CandidateSeed[] = [];
  const rolesNeeded = missingRoles(selected);

  const pattern  = firstRenderable(input.conceptBlocks.map((b) => b.pattern));
  const reason   = firstRenderable(input.conceptBlocks.map((b) => b.reason));
  const rule     = firstRenderable(input.conceptBlocks.map((b) => b.rule));
  const trap     = firstRenderable(input.conceptBlocks.map((b) => b.trap));
  const anchor   = firstRenderable((input.supportNeighborhoods ?? []).map((n) => n.anchor));
  const support  = firstRenderable((input.supportNeighborhoods ?? []).flatMap((n) => n.support ?? []));
  const title    = sanitizeSentence(input.pageTitle ?? "");
  const summary  = sanitizeSentence(input.pageSummary ?? "");

  const tryAdd = (id: string, text: string | null, role: CompressionRole, score: number) => {
    if (!text) return;
    if (passesStrictAntiDup(text, selected.map((s) => s.text), protectedTexts, role, selected)) {
      out.push({ id, text, role, score, source: "synthesized" });
    }
  };

  if (rolesNeeded.has("recognition"))
    tryAdd("synth:recognition", synthesizeRecognitionRule(title, summary, pattern, anchor), "recognition", 0.84);
  if (rolesNeeded.has("mechanism"))
    tryAdd("synth:mechanism", synthesizeMechanismRule(reason, support, pattern, summary), "mechanism", 0.86);
  if (rolesNeeded.has("application"))
    tryAdd("synth:application", synthesizeApplicationRule(rule, pattern, support, summary), "application", 0.83);
  if (rolesNeeded.has("boundary"))
    tryAdd("synth:boundary", synthesizeBoundaryRule(trap, pattern, reason, summary), "boundary", 0.80);

  // Fallback cross-role syntheses for replacing weak copied lines
  const fallbacks = [
    synthesizeRecognitionRule(title, summary, pattern, anchor),
    synthesizeMechanismRule(reason, support, pattern, summary),
    synthesizeApplicationRule(rule, pattern, support, summary),
    synthesizeBoundaryRule(trap, pattern, reason, summary),
  ];
  fallbacks.forEach((text, i) => {
    if (!text) return;
    if (passesStrictAntiDup(text, selected.map((s) => s.text), protectedTexts, undefined, selected)) {
      out.push({ id: `synth:fallback:${i}`, text, role: inferRoleFromSentence(text), score: 0.75 - i * 0.02, source: "synthesized" });
    }
  });

  return dedupeCandidates(out);
}

/* -------------------------------------------------------------------------- */
/*                             STRICT ANTI-DUP LOGIC                          */
/* -------------------------------------------------------------------------- */

function collectProtectedTexts(input: BuildCompressionRulesInput): string[] {
  const out: string[] = [];
  if (isRenderableSentence(input.pageSummary)) out.push(sanitizeSentence(input.pageSummary!));
  for (const b of input.conceptBlocks) {
    if (isRenderableSentence(b.pattern)) out.push(sanitizeSentence(b.pattern!));
    if (isRenderableSentence(b.reason))  out.push(sanitizeSentence(b.reason!));
    if (isRenderableSentence(b.rule))    out.push(sanitizeSentence(b.rule!));
    if (isRenderableSentence(b.trap))    out.push(sanitizeSentence(b.trap!));
  }
  return out;
}

function selectDistinctCandidate(
  candidates: CandidateSeed[],
  selected: CompressionRule[],
  protectedTexts: string[],
  preferredRole?: CompressionRole
): CandidateSeed | null {
  for (const c of candidates) {
    if (passesStrictAntiDup(c.text, selected.map((s) => s.text), protectedTexts, preferredRole, selected)) return c;
  }
  return null;
}

function passesStrictAntiDup(
  text: string,
  selectedTexts: string[],
  protectedTexts: string[],
  preferredRole?: CompressionRole,
  selectedRules?: CompressionRule[]
): boolean {
  const cleaned = sanitizeSentence(text);
  if (!cleaned || !isRenderableSentence(cleaned)) return false;

  // 1. Distinct from already-selected compression rules
  if (!isDistinctEnough(cleaned, selectedTexts, 0.66)) return false;

  // 2. Distinct from protected source texts — reject near-copies of panel fields
  for (const source of protectedTexts) {
    const sn = normalize(source);
    const cn = normalize(cleaned);
    if (!sn || !cn) continue;
    if (tokenSimilarity(cn, sn) >= 0.84 || containmentSimilarity(cn, sn) >= 0.88) return false;
    if (sameLead(cn, sn) && tokenSimilarity(cn, sn) >= 0.72) return false;
  }

  // 3. Role-aware diversity
  if (preferredRole && selectedRules?.length) {
    const sameRoleTexts = selectedRules.filter((r) => r.role === preferredRole).map((r) => r.text);
    if (!isDistinctEnough(cleaned, sameRoleTexts, 0.60)) return false;
  }

  return true;
}

function isDistinctEnough(text: string, existing: string[], threshold: number): boolean {
  const norm = normalize(text);
  if (!norm) return false;
  for (const e of existing) {
    const en = normalize(e);
    if (!en) continue;
    if (norm === en) return false;
    if (tokenSimilarity(norm, en) >= threshold) return false;
    if (containmentSimilarity(norm, en) >= threshold + 0.12) return false;
  }
  return true;
}

function dedupeCandidates(candidates: CandidateSeed[]): CandidateSeed[] {
  const kept: CandidateSeed[] = [];
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    if (isDistinctEnough(c.text, kept.map((k) => k.text), 0.72)) kept.push(c);
  }
  return kept;
}

/* -------------------------------------------------------------------------- */
/*                               TRUE SYNTHESIS                               */
/* -------------------------------------------------------------------------- */

function synthesizeRecognitionRule(title: string, summary: string, pattern?: string | null, anchor?: string | null): string | null {
  const src = firstRenderable([pattern, anchor, summary]);
  return src ? compressToRule(src, "recognition") : null;
}

function synthesizeMechanismRule(reason?: string | null, support?: string | null, pattern?: string | null, summary?: string | null): string | null {
  const src = firstRenderable([reason, support, pattern, summary]);
  return src ? compressToRule(src, "mechanism") : null;
}

function synthesizeApplicationRule(rule?: string | null, pattern?: string | null, support?: string | null, summary?: string | null): string | null {
  const src = firstRenderable([rule, support, pattern, summary]);
  return src ? compressToRule(src, "application") : null;
}

function synthesizeBoundaryRule(trap?: string | null, pattern?: string | null, reason?: string | null, summary?: string | null): string | null {
  const src = firstRenderable([trap, pattern, reason, summary]);
  return src ? compressToRule(src, "boundary") : null;
}

function compressToRule(text: string, role: CompressionRole): string | null {
  const c = distillClause(text);
  if (!c) return null;
  const stripped = c.replace(/[.!?]+$/, "").trim();

  switch (role) {
    case "recognition": {
      // "X indicates/means Y" → "X = Y." only when RHS is a noun phrase, not a clause
      const m = stripped.match(/^(.{4,40}?)\s+(indicates?|means?|represents?|is defined as)\s+(.{4,60})/i);
      if (m) {
        const rhs = m[3].trim();
        if (!/^(how|that|which|what|whether|when|if|where)\b/i.test(rhs)) {
          return ensureSentence(`${m[1].trim()} = ${lowercaseFirst(truncW(rhs, 7))}`);
        }
      }
      return ensureSentence(truncAtClause(stripped, 18));
    }
    case "mechanism": {
      // "X leads to / causes / results in Y" → "X → Y."
      const m = stripped.match(/^(.{4,45}?)\s+(?:leads? to|therefore|causes?|results? in)\s+(.{4,55})/i);
      if (m) return ensureSentence(`${truncW(m[1], 8)} → ${lowercaseFirst(truncW(m[2], 10))}`);
      // "Because X, Y" → "X → Y."
      const m2 = stripped.match(/^because\s+(.{4,40}?)[,;]\s+(.{4,40})/i);
      if (m2) return ensureSentence(`${truncW(m2[1], 8)} → ${lowercaseFirst(truncW(m2[2], 8))}`);
      if (startsWithMechanismSignal(stripped)) return ensureSentence(truncAtClause(stripped, 16));
      return ensureSentence(truncAtClause(stripped, 16));
    }
    case "application": {
      // "X can be ignored/negligible" → "Ignore X in this context."
      const m = stripped.match(/^(.{4,40}?)\s+(?:can be|is|are)\s+(?:ignored?|negligible|disregarded?)/i);
      if (m) return ensureSentence(`Ignore ${lowercaseFirst(truncW(m[1], 7))} in this context`);
      if (startsWithActionSignal(stripped)) return ensureSentence(truncAtClause(stripped, 16));
      return ensureSentence(truncAtClause(stripped, 16));
    }
    case "boundary": {
      // "If/when X changes → Y"
      const m = stripped.match(/(?:if|when)\s+(.{4,35}?)\s+changes?[,;]?\s+(.{4,45})/i);
      if (m) return ensureSentence(`If ${m[1].trim()} changes → ${lowercaseFirst(truncW(m[2], 8))}`);
      // "X is not / unlike / different from Y" → "X ≠ Y."
      const m2 = stripped.match(/^(.{4,35}?)\s+(?:is not|are not|unlike|different from)\s+(.{4,40})/i);
      if (m2) return ensureSentence(`${truncW(m2[1], 8)} ≠ ${lowercaseFirst(truncW(m2[2], 8))}`);
      if (/^do not\b/i.test(stripped)) return ensureSentence(truncAtClause(stripped, 16));
      return ensureSentence(truncAtClause(stripped, 16));
    }
  }
}

function truncW(text: string, n: number): string {
  const words = (text ?? "").replace(/[.!?]+$/, "").split(/\s+/);
  return words.length <= n ? text.replace(/[.!?]+$/, "") : words.slice(0, n).join(" ");
}

function truncAtClause(text: string, maxWords: number): string {
  const stripped = (text ?? "").replace(/[.!?]+$/, "").trim();
  const words = stripped.split(/\s+/);
  if (words.length <= maxWords) return stripped;
  // Try to cut at first clause boundary after 6+ words
  const clauseEnd = stripped.search(/,|;|\s+(?:and|but|or|which|that|where|when)\s/);
  if (clauseEnd > 0 && stripped.slice(0, clauseEnd).split(/\s+/).length >= 6) {
    return stripped.slice(0, clauseEnd).trim();
  }
  return words.slice(0, maxWords).join(" ");
}

function distillClause(text: string): string {
  const cleaned = sanitizeSentence(text)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\b(?:however|for example|such as|although|rather than|instead|whereas)\b/i);
  return (parts[0] ?? cleaned)
    .replace(/^(this page|the page|this concept|this section)\s+(shows|explains|covers|develops)\s+/i, "")
    .replace(/^(ultimately|in general|overall|therefore)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

function materializeRule(seed: CandidateSeed, index: number): CompressionRule {
  return { id: `compression-${index}-${seed.role}`, text: ensureSentence(seed.text), role: seed.role, score: seed.score, source: seed.source };
}

function missingRoles(selected: CompressionRule[]): Set<CompressionRole> {
  const used = new Set(selected.map((s) => s.role));
  return new Set((["recognition", "mechanism", "application", "boundary"] as CompressionRole[]).filter((r) => !used.has(r)));
}

function firstRenderable(values: Array<string | null | undefined>): string | null {
  for (const v of values) { if (isRenderableSentence(v)) return sanitizeSentence(v!); }
  return null;
}

function inferRoleFromSentence(text: string): CompressionRole {
  const n = normalize(text);
  if (hasAny(n, ["because", "therefore", "so that", "causes", "results in", "due to", "leads to"])) return "mechanism";
  if (hasAny(n, ["do not", "avoid", "rather than", "however", "except", "not to be confused"])) return "boundary";
  if (hasAny(n, ["use", "apply", "recognize", "should", "must", "can be used"])) return "application";
  return "recognition";
}

function normalizeTrapToBoundary(text: string): string {
  const cleaned = sanitizeSentence(text);
  if (/^do not\b/i.test(cleaned) || /^avoid\b/i.test(cleaned)) return ensureSentence(cleaned);
  return ensureSentence(`Do not confuse ${lowercaseFirst(stripTerminal(cleaned))}`);
}

function sanitizeSentence(text?: string | null): string {
  return ensureSentence((text ?? "").replace(/\s+/g, " ").replace(/\s*[-–—]\s*/g, " ").trim());
}

function ensureSentence(text: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
}

function isRenderableSentence(text?: string | null): boolean {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.length < 24) return false;
  if (/[.…]{2,}/.test(t)) return false;
  if (/^[\d\s.,\-:;()]+$/.test(t)) return false;
  return t.split(/\s+/).length >= 6;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSimilarity(a: string, b: string): number {
  const as = new Set(a.split(" ").filter(Boolean));
  const bs = new Set(b.split(" ").filter(Boolean));
  if (!as.size || !bs.size) return 0;
  let overlap = 0;
  for (const t of as) { if (bs.has(t)) overlap++; }
  return new Set([...as, ...bs]).size ? overlap / new Set([...as, ...bs]).size : 0;
}

function containmentSimilarity(a: string, b: string): number {
  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);
  if (!at.length || !bt.length) return 0;
  const shorter = at.length <= bt.length ? at : bt;
  const longerSet = new Set(at.length <= bt.length ? bt : at);
  let overlap = 0;
  for (const t of shorter) { if (longerSet.has(t)) overlap++; }
  return shorter.length ? overlap / shorter.length : 0;
}

function sameLead(a: string, b: string): boolean {
  const al = a.split(" ").slice(0, 5).join(" ");
  const bl = b.split(" ").slice(0, 5).join(" ");
  return Boolean(al && bl && al === bl);
}

function stripTerminal(text: string): string { return text.replace(/[.!?]+$/, "").trim(); }
function lowercaseFirst(text: string): string { return text ? text.charAt(0).toLowerCase() + text.slice(1) : text; }
function startsWithMechanismSignal(text: string): boolean { return /^(because|this works because|when|as|since)\b/i.test(text); }
function startsWithActionSignal(text: string): boolean { return /^(use|apply|recognize|treat|interpret|identify|consider|remember)\b/i.test(text); }
function hasAny(text: string, needles: string[]): boolean { return needles.some((n) => text.includes(n)); }
