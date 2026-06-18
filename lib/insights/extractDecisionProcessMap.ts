// lib/insights/extractDecisionProcessMap.ts
//
// Level 3 of the LeftPanel evolution: derives a lightweight process-flow and
// decision-rule structure from the page's existing thought units, with no
// new pipeline or API calls. Process steps come from kind="mechanism" units
// in page order (sourceParagraphIndex already reflects reading order).
// Decision rules come from any unit whose text matches if/criteria/threshold
// language, with a best-effort if/then split for display.

import type { HighlightTarget } from "@/lib/readerContracts";

export interface ProcessStepEntry {
  id: string;
  evidenceRefId: string;
  text: string;
  stepNumber: number;
}

export interface DecisionRuleEntry {
  id: string;
  evidenceRefId: string;
  text: string;
  condition?: string;
  outcome?: string;
}

export interface DecisionProcessMap {
  processSteps: ProcessStepEntry[];
  decisionRules: DecisionRuleEntry[];
}

const DECISION_CUE_RE = /\b(if|when|criteria|staging|grade|stage|classification|indicates?|threshold|cutoff|greater than|less than|≥|≤)\b/i;
const IF_THEN_RE = /\bif\b(.+?)(?:,?\s*\bthen\b|,)(.+)/i;
const IF_ONLY_RE = /\bif\b(.+)/i;

export function extractDecisionProcessMap(targets: HighlightTarget[]): DecisionProcessMap {
  const processSteps: ProcessStepEntry[] = targets
    .filter((t) => t.kind === "mechanism")
    .sort((a, b) => a.sourceParagraphIndex - b.sourceParagraphIndex)
    .map((t, i) => ({
      id: t.id,
      evidenceRefId: t.evidenceRefId,
      text: t.text,
      stepNumber: i + 1,
    }));

  const decisionRules: DecisionRuleEntry[] = targets
    .filter((t) => DECISION_CUE_RE.test(t.text))
    .map((t) => {
      const ifThen = t.text.match(IF_THEN_RE);
      if (ifThen) {
        return {
          id: t.id,
          evidenceRefId: t.evidenceRefId,
          text: t.text,
          condition: ifThen[1].trim(),
          outcome: ifThen[2].trim(),
        };
      }
      const ifOnly = t.text.match(IF_ONLY_RE);
      if (ifOnly) {
        return {
          id: t.id,
          evidenceRefId: t.evidenceRefId,
          text: t.text,
          condition: ifOnly[1].trim(),
        };
      }
      return { id: t.id, evidenceRefId: t.evidenceRefId, text: t.text };
    });

  return { processSteps, decisionRules };
}
