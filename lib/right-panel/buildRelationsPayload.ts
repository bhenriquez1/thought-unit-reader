import type { ActivePageContext, PageClassification, PageSignals, RelationsPayload } from "@/lib/readerContracts";

function byKind(signals: PageSignals, kind: string, limit = 3): string[] {
  return (signals.paragraphSignals || [])
    .filter((p) => !p.suppress && (kind === "any" || p.kind === kind))
    .sort((a, b) => b.yieldScore - a.yieldScore)
    .slice(0, limit)
    .map((p) => p.text);
}

export function buildRelationsPayload(_ctx: ActivePageContext, classification: PageClassification, signals: PageSignals): RelationsPayload {
  const definitions = byKind(signals, "definition", 2);
  const mechanisms = byKind(signals, "mechanism", 2);
  const clinical = byKind(signals, "clinical", 2);
  const formula = byKind(signals, "formula", 2);

  if (signals.pageRole && ["cover", "contents", "chapter_opener", "section_opener", "copyright_frontmatter", "image_scan_heavy"].includes(signals.pageRole)) {
    return {
      prerequisites: ["Structural page: infer prerequisites conservatively."],
      currentLinks: [],
      downstreamLinks: ["Move to teaching-dense pages for grounded relation mapping."],
    };
  }
  if (signals.pageRole === "history_background") {
    return {
      prerequisites: definitions.length ? definitions : ["Baseline concept vocabulary"],
      currentLinks: byKind(signals, "any", 3),
      downstreamLinks: ["Connect milestone to modern practice or exam application"],
    };
  }

  if (classification.pageType === "clinical") {
    return {
      prerequisites: definitions.length ? definitions : ["Core anatomy/pathology prerequisite"],
      currentLinks: clinical.length ? clinical : ["Sign-symptom-diagnosis chain"],
      downstreamLinks: mechanisms.length ? mechanisms : ["Management and prognosis decisions"],
    };
  }

  if (classification.pageType === "formula") {
    return {
      prerequisites: definitions.length ? definitions : ["Symbol definitions and prior identities"],
      currentLinks: formula.length ? formula : ["Related formula transformations"],
      downstreamLinks: mechanisms.length ? mechanisms : ["Problem families using this identity"],
    };
  }

  return {
    prerequisites: definitions.length ? definitions : byKind(signals, "any", 1),
    currentLinks: mechanisms.length ? mechanisms : byKind(signals, "any", 2),
    downstreamLinks: byKind(signals, "application", 2).length ? byKind(signals, "application", 2) : byKind(signals, "any", 2),
  };
}
