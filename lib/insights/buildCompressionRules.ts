// lib/insights/buildCompressionRules.ts
// v2: role-balanced, current-page only, hard 3-rule minimum.
//
// Job contract: Compression must NOT copy Core Idea / Pattern / Reason / Trap / Rule.
// Each rule covers a different cognitive layer of the page.

export type CompressionRole =
  | "recognition"
  | "mechanism"
  | "application"
  | "boundary";

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
  source: "summary" | "block_pattern" | "block_reason" | "block_rule" | "block_trap" | "neighborhood_anchor" | "neighborhood_support" | "synthesized";
}

export interface BuildCompressionRulesResult {
  pageKey?: string | null;
  rules: CompressionRule[];
  rejected: CompressionRule[];
}

export function buildCompressionRules(
  input: BuildCompressionRulesInput
): BuildCompressionRulesResult {
  const minRules = Math.max(3, input.minRules ?? 3);

  const candidates = collectCandidates(input);
  const selected: CompressionRule[] = [];
  const rejected: CompressionRule[] = [];

  const roleOrder: CompressionRole[] = [
    "recognition",
    "mechanism",
    "application",
    "boundary",
  ];

  // Pass 1: one distinct rule per role
  for (const role of roleOrder) {
    const roleCandidates = candidates
      .filter((c) => c.role === role)
      .sort((a, b) => b.score - a.score);

    const picked = selectDistinctCandidate(roleCandidates, selected);
    if (picked) selected.push(picked);
  }

  // Pass 2: backfill until minimum
  const remaining = candidates
    .filter((c) => !selected.some((s) => s.id === c.id))
    .sort((a, b) => b.score - a.score);

  for (const candidate of remaining) {
    if (selected.length >= minRules) break;
    if (isDistinctEnough(candidate.text, selected.map((s) => s.text))) {
      selected.push(candidate);
    } else {
      rejected.push(candidate);
    }
  }

  // Pass 3: synthesize from page inputs if still underfilled
  while (selected.length < minRules) {
    const synthetic = synthesizeRule(input, selected);
    if (!synthetic) break;
    if (isDistinctEnough(synthetic.text, selected.map((s) => s.text))) {
      selected.push(synthetic);
    } else {
      rejected.push(synthetic);
      break;
    }
  }

  const finalRules = selected
    .slice(0, Math.max(minRules, selected.length))
    .map((rule, idx) => ({
      ...rule,
      id: `compression-${idx + 1}-${rule.role}`,
      text: ensureSentence(rule.text),
    }));

  return {
    pageKey: input.pageKey ?? null,
    rules: finalRules,
    rejected,
  };
}

/* -------------------------------------------------------------------------- */
/*                             CANDIDATE COLLECTION                           */
/* -------------------------------------------------------------------------- */

function collectCandidates(input: BuildCompressionRulesInput): CompressionRule[] {
  const out: CompressionRule[] = [];

  if (input.pageSummary && isRenderableSentence(input.pageSummary)) {
    out.push({
      id: "summary-recognition",
      text: input.pageSummary,
      role: "recognition",
      score: 0.9,
      source: "summary",
    });
  }

  for (const block of input.conceptBlocks) {
    if (block.pattern && isRenderableSentence(block.pattern)) {
      out.push({
        id: `${block.id}-pattern`,
        text: compressSentence(block.pattern),
        role: "recognition",
        score: 0.86,
        source: "block_pattern",
      });
    }
    if (block.reason && isRenderableSentence(block.reason)) {
      out.push({
        id: `${block.id}-reason`,
        text: compressSentence(block.reason),
        role: "mechanism",
        score: 0.88,
        source: "block_reason",
      });
    }
    if (block.rule && isRenderableSentence(block.rule)) {
      out.push({
        id: `${block.id}-rule`,
        text: compressSentence(block.rule),
        role: "application",
        score: 0.87,
        source: "block_rule",
      });
    }
    if (block.trap && isRenderableSentence(block.trap)) {
      out.push({
        id: `${block.id}-trap`,
        text: normalizeTrapToRule(block.trap),
        role: "boundary",
        score: 0.82,
        source: "block_trap",
      });
    }
  }

  for (const neighborhood of input.supportNeighborhoods ?? []) {
    if (neighborhood.anchor && isRenderableSentence(neighborhood.anchor)) {
      out.push({
        id: `${neighborhood.id}-anchor`,
        text: compressSentence(neighborhood.anchor),
        role: "recognition",
        score: 0.8,
        source: "neighborhood_anchor",
      });
    }
    for (const [index, support] of (neighborhood.support ?? []).entries()) {
      if (!isRenderableSentence(support)) continue;
      out.push({
        id: `${neighborhood.id}-support-${index}`,
        text: compressSentence(support),
        role: inferRoleFromSentence(support),
        score: 0.72 - index * 0.03,
        source: "neighborhood_support",
      });
    }
    if (neighborhood.trap && isRenderableSentence(neighborhood.trap)) {
      out.push({
        id: `${neighborhood.id}-trap`,
        text: normalizeTrapToRule(neighborhood.trap),
        role: "boundary",
        score: 0.76,
        source: "block_trap",
      });
    }
  }

  return dedupeCandidates(out);
}

function dedupeCandidates(candidates: CompressionRule[]): CompressionRule[] {
  const kept: CompressionRule[] = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (isDistinctEnough(candidate.text, kept.map((k) => k.text))) {
      kept.push(candidate);
    }
  }
  return kept;
}

/* -------------------------------------------------------------------------- */
/*                              SELECTION + SYNTHESIS                         */
/* -------------------------------------------------------------------------- */

function selectDistinctCandidate(
  candidates: CompressionRule[],
  selected: CompressionRule[]
): CompressionRule | null {
  for (const candidate of candidates) {
    if (isDistinctEnough(candidate.text, selected.map((s) => s.text))) {
      return candidate;
    }
  }
  return null;
}

function synthesizeRule(
  input: BuildCompressionRulesInput,
  selected: CompressionRule[]
): CompressionRule | null {
  const usedRoles = new Set(selected.map((s) => s.role));
  const role = nextMissingRole(usedRoles);
  return synthesizeFromInputs(input, role);
}

function nextMissingRole(used: Set<CompressionRole>): CompressionRole {
  if (!used.has("recognition"))  return "recognition";
  if (!used.has("mechanism"))    return "mechanism";
  if (!used.has("application"))  return "application";
  return "boundary";
}

function synthesizeFromInputs(
  input: BuildCompressionRulesInput,
  role: CompressionRole
): CompressionRule | null {
  const summary   = safe(input.pageSummary);
  const title     = safe(input.pageTitle);
  const firstBlock = input.conceptBlocks[0];

  switch (role) {
    case "recognition":
      if (summary) return { id: "synthetic-recognition", text: compressSentence(summary), role, score: 0.61, source: "synthesized" };
      if (title && firstBlock?.pattern)
        return { id: "synthetic-recognition-title", text: `${title} centers on ${lowercaseFirst(stripTerminal(firstBlock.pattern))}.`, role, score: 0.58, source: "synthesized" };
      return null;

    case "mechanism":
      if (firstBlock?.reason) return { id: "synthetic-mechanism", text: compressSentence(firstBlock.reason), role, score: 0.6, source: "synthesized" };
      if (input.supportNeighborhoods?.[0]?.support?.[0])
        return { id: "synthetic-mechanism-support", text: compressSentence(input.supportNeighborhoods[0].support![0]), role, score: 0.57, source: "synthesized" };
      return null;

    case "application":
      if (firstBlock?.rule) return { id: "synthetic-application", text: compressSentence(firstBlock.rule), role, score: 0.59, source: "synthesized" };
      if (summary)
        return { id: "synthetic-application-summary", text: `Use this page to recognize and apply the idea that ${lowercaseFirst(stripTerminal(summary))}.`, role, score: 0.52, source: "synthesized" };
      return null;

    case "boundary":
      if (firstBlock?.trap) return { id: "synthetic-boundary", text: normalizeTrapToRule(firstBlock.trap), role, score: 0.55, source: "synthesized" };
      return { id: "synthetic-boundary-fallback", text: "Do not confuse the page's main signal with nearby supporting details.", role, score: 0.45, source: "synthesized" };
  }
}

/* -------------------------------------------------------------------------- */
/*                                 ROLE INFERENCE                             */
/* -------------------------------------------------------------------------- */

function inferRoleFromSentence(text: string): CompressionRole {
  const norm = normalize(text);
  if (hasAny(norm, ["because", "therefore", "so that", "leads to", "causes", "due to", "results in"])) return "mechanism";
  if (hasAny(norm, ["do not", "avoid", "rather than", "however", "unlike", "except", "not to be confused"])) return "boundary";
  if (hasAny(norm, ["use", "apply", "recognize", "should", "must", "can be used"])) return "application";
  return "recognition";
}

/* -------------------------------------------------------------------------- */
/*                              TEXT UTILITIES                                 */
/* -------------------------------------------------------------------------- */

function normalizeTrapToRule(text: string): string {
  const cleaned = compressSentence(text);
  if (/^do not\b/i.test(cleaned) || /^avoid\b/i.test(cleaned)) return ensureSentence(cleaned);
  return ensureSentence(`Do not confuse ${lowercaseFirst(stripTerminal(cleaned))}.`);
}

function compressSentence(text: string): string {
  return ensureSentence(text).replace(/\s+/g, " ").replace(/\s*–\s*/g, " — ").trim();
}

function ensureSentence(text: string): string {
  const t = safe(text).replace(/\s+/g, " ").trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function isRenderableSentence(text: string): boolean {
  const t = safe(text);
  if (!t || t.length < 20) return false;
  if (/[.…]{2,}/.test(t)) return false;
  return t.split(/\s+/).filter(Boolean).length >= 5;
}

function isDistinctEnough(text: string, existing: string[]): boolean {
  const norm = normalize(text);
  if (!norm) return false;
  for (const candidate of existing) {
    const other = normalize(candidate);
    if (!other) continue;
    if (norm === other) return false;
    if (tokenSimilarity(norm, other) >= 0.72) return false;
  }
  return true;
}

function tokenSimilarity(a: string, b: string): number {
  const aSet = new Set(a.split(" ").filter(Boolean));
  const bSet = new Set(b.split(" ").filter(Boolean));
  if (!aSet.size || !bSet.size) return 0;
  let overlap = 0;
  for (const token of aSet) { if (bSet.has(token)) overlap += 1; }
  return new Set([...aSet, ...bSet]).size ? overlap / new Set([...aSet, ...bSet]).size : 0;
}

function normalize(text: string): string {
  return safe(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safe(value?: string | null): string { return (value ?? "").trim(); }
function stripTerminal(text: string): string { return safe(text).replace(/[.!?]+$/, ""); }
function lowercaseFirst(text: string): string {
  const v = safe(text);
  return v ? v.charAt(0).toLowerCase() + v.slice(1) : v;
}
function hasAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}
