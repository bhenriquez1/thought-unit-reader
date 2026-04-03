import type { AudienceMode, DepthMode, ParagraphSignal } from "@/lib/readerContracts";

export interface ReasoningModeProfile {
  label: "student" | "standard" | "expert";
  maxEvidence: number;
  minYield: number;
  simplifyLanguage: boolean;
  emphasizeMechanism: boolean;
  emphasizeTraps: boolean;
}

export function buildModeProfile(audience: AudienceMode, depth: DepthMode): ReasoningModeProfile {
  if (audience === "expert" || depth === "deep") {
    return {
      label: "expert",
      maxEvidence: 7,
      minYield: 0.28,
      simplifyLanguage: false,
      emphasizeMechanism: true,
      emphasizeTraps: true,
    };
  }

  if (audience === "student") {
    return {
      label: "student",
      maxEvidence: 4,
      minYield: 0.4,
      simplifyLanguage: true,
      emphasizeMechanism: false,
      emphasizeTraps: false,
    };
  }

  return {
    label: "standard",
    maxEvidence: 5,
    minYield: 0.34,
    simplifyLanguage: false,
    emphasizeMechanism: true,
    emphasizeTraps: false,
  };
}

export function filterEvidenceByMode(signals: ParagraphSignal[] = [], mode: ReasoningModeProfile): ParagraphSignal[] {
  return signals
    .filter((signal) => !signal.suppress && signal.yieldScore >= mode.minYield)
    .sort((a, b) => b.yieldScore - a.yieldScore)
    .slice(0, mode.maxEvidence);
}

export function adaptLineForMode(line: string, mode: ReasoningModeProfile): string {
  const trimmed = line.trim();
  if (!trimmed) return trimmed;
  if (!mode.simplifyLanguage) return trimmed;
  return trimmed
    .replace(/\btherefore\b/gi, "so")
    .replace(/\bconsequently\b/gi, "so")
    .replace(/\bapproximately\b/gi, "about");
}
