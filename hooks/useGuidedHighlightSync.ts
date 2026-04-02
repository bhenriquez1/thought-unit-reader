import { useCallback, useEffect, useMemo, useState } from "react";
import type { EvidenceAnchor, GuidedReadStep } from "@/lib/insights/types";

type UseGuidedHighlightSyncArgs = {
  steps: GuidedReadStep[];
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void;
  resolveEvidenceId?: (anchor: EvidenceAnchor) => string | undefined;
};

type UseGuidedHighlightSyncResult = {
  selectedStepId: string | null;
  selectStep: (step: GuidedReadStep) => void;
  previewStep: (step: GuidedReadStep | null) => void;
  clearSelection: () => void;
};

export function useGuidedHighlightSync({
  steps,
  onEvidenceClick,
  resolveEvidenceId,
}: UseGuidedHighlightSyncArgs): UseGuidedHighlightSyncResult {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const firstStep = useMemo(() => steps[0] || null, [steps]);

  useEffect(() => {
    if (!firstStep) {
      setSelectedStepId(null);
      return;
    }
    setSelectedStepId(firstStep.id);
    triggerEvidence(firstStep, onEvidenceClick, resolveEvidenceId);
  }, [firstStep, onEvidenceClick, resolveEvidenceId]);

  const selectStep = useCallback(
    (step: GuidedReadStep) => {
      setSelectedStepId(step.id);
      triggerEvidence(step, onEvidenceClick, resolveEvidenceId);
    },
    [onEvidenceClick, resolveEvidenceId],
  );

  const previewStep = useCallback(
    (step: GuidedReadStep | null) => {
      if (!step) return;
      triggerEvidence(step, onEvidenceClick, resolveEvidenceId);
    },
    [onEvidenceClick, resolveEvidenceId],
  );

  const clearSelection = useCallback(() => {
    setSelectedStepId(null);
  }, []);

  return {
    selectedStepId,
    selectStep,
    previewStep,
    clearSelection,
  };
}

function triggerEvidence(
  step: GuidedReadStep,
  onEvidenceClick?: (snippet: string, evidenceId?: string) => void,
  resolveEvidenceId?: (anchor: EvidenceAnchor) => string | undefined,
) {
  const anchor = step.evidence[0];
  if (!anchor) return;
  const evidenceId = resolveEvidenceId?.(anchor) || anchor.id;
  onEvidenceClick?.(anchor.text, evidenceId);
}
