# Runtime Failure Analysis (No Patch)

This document captures runtime intermediates for one biology page and one calculus page using the current production pipeline (`processPage` → normalization/domain/teaching-zone → concept extraction → step model → mini test/compression → ultra right-panel view).

Source artifact with full intermediates:
- `test_reports/runtime_failure_analysis.json`

## Exact Failure Stages

### 1) Biology failure stage

**Failure stage:** **Domain detection (early)** and **core-idea fallback (right panel synthesis).**

- The biology case was classified as `math` instead of `science` because the domain detector matches `matrix` and the page includes "mitochondrial matrix". This happens before domain-priority scoring and shifts ranking behavior.
- The ULTRA debug reports `coreIdeaSource: pageSummary`, but the rendered core idea still collapses to the hard fallback sentence (`"This page develops one core idea through a small set of connected concepts."`), indicating the summary-fed core idea path is degraded by cleanup/renderability checks before final emission.

### 2) Calculus failure stage

**Failure stage:** **Left guided role inference (`buildPageStepModel`)**.

- The calculus case produces right-panel content (core idea, blocks, mini test, compression), so the right pipeline is active.
- But step-role inference marks all steps as `trap`, which degrades the left guided path into warning-style badges and prevents a meaningful progression (`main_signal` → `explanation` → `support`).

### 3) Left-panel highlighting failure stage

**Failure stage:** **Step-role classifier priority order and trap-trigger broadness.**

- Neighborhoods are generated (non-zero count), and `conceptRole` survives in neighborhood objects.
- However, step role assignment checks trap phrases first (`do not confuse`, `trap`, `mistake`, `warning`), so if any of these words appear in aggregated neighborhood/block/support text, the step becomes `trap` regardless of conceptual position.
- This pushes the left panel toward local warning emphasis rather than page-structure understanding.

### 4) Mini Test failure stage

**Failure stage:** **Candidate text quality inherited from step hooks and concept block text.**

- Candidate generation is complete (biology 20 candidates, calculus 15; 5 selected each), and role balancing is working.
- But question quality is bounded by upstream hook text. When step roles/anchors are degraded (e.g., trap-heavy or generic anchor text), selected questions become only slightly better rather than strongly page-native.

### 5) STR compression wiring failure stage

**Failure stage:** **Selection bias inside compression candidate ranking (not render detachment).**

- Compression is wired to final ULTRA render path (`view.compression` is rendered directly in `UltraView`).
- In both analyzed cases, all winning rules come from `block_reason`, while synthesized/neighborhood candidates are rejected in final selection.
- So STR wiring exists, but fallback-like block reason candidates dominate final picks; synthesized rules are not reliably winning.

## A/B/C/D/E Checklist Coverage

- Raw extracted text: captured.
- Domain detection + page kind + full-panel gate: captured.
- Filtered paragraphs + teaching zone: captured.
- Concept role classification + priority scores: captured.
- Core/concept source + mini/compression candidates + selected outputs: captured.
- Highlight neighborhoods + right-panel final object: captured.

See `test_reports/runtime_failure_analysis.json` for full runtime data.
