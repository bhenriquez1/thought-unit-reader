// tests/reader/rightPanelCanonicalNoninstructionalGate.test.ts
// P0 stabilization, Tier 1 — RightPanel.tsx used to hand-maintain its own
// local STRUCTURAL_PAGE_ROLES Set (17 roles) instead of importing
// lib/insights/pageRoleGate.ts's canonical isNoninstructionalPage()/
// NONINSTRUCTIONAL_PAGE_ROLES — the single shared gate every other
// content-generation surface (Surgeon, extractPageSignals,
// useActivePageIntelligence, pages/index.tsx's headless study-model
// fallback) already consolidated onto. The two sets were role-identical,
// so this was a latent duplicate-classifier maintenance hazard rather than
// an active bug — nothing enforced they'd stay in sync. This proves the
// duplicate is gone and RightPanel now calls the same canonical helper the
// rest of the pipeline uses.
//
// No jsdom/render harness for RightPanel.tsx in this repo — source
// inspection, matching this repo's established pattern for this file.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/reader/RightPanel.tsx"), "utf8");

describe("components/reader/RightPanel.tsx — isStructuralPage uses the canonical gate, not a local duplicate", () => {
  it("REQUIRED: imports isNoninstructionalPage from the canonical pageRoleGate module", () => {
    expect(SRC).toContain('import { isNoninstructionalPage } from "@/lib/insights/pageRoleGate";');
  });

  it("REQUIRED: isStructuralPage is derived from isNoninstructionalPage(intelligence.pageRole), not a local role Set", () => {
    const idx = SRC.indexOf("const isStructuralPage = isNoninstructionalPage(intelligence.pageRole);");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: the old hand-maintained STRUCTURAL_PAGE_ROLES Set is gone", () => {
    expect(SRC).not.toMatch(/const STRUCTURAL_PAGE_ROLES = new Set/);
  });

  it("blockEmit (onStudyModelReady gating) and pageBlocked still derive from isStructuralPage, unchanged by this refactor", () => {
    const blockEmitIdx = SRC.indexOf("const blockEmit = isStructuralPage || openAIConfirmsNonInstructional;");
    const pageBlockedIdx = SRC.indexOf("const pageBlocked = isStructuralPage || pageIsNonInstructional || openAIConfirmsNonInstructional;");
    expect(blockEmitIdx).toBeGreaterThan(-1);
    expect(pageBlockedIdx).toBeGreaterThan(-1);
  });
});

describe("pages/index.tsx — headless study-model fallback's comment no longer references the removed local RightPanel Set", () => {
  const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

  it("no longer mentions the removed STRUCTURAL_PAGE_ROLES name", () => {
    expect(PAGE_SRC).not.toMatch(/STRUCTURAL_PAGE_ROLES/);
  });

  it("still documents that both paths call the same canonical isNoninstructionalPage()", () => {
    const idx = PAGE_SRC.indexOf("if (!currentUltraPageView || !isCurrentIntelligencePage) return;");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(Math.max(0, idx - 900), idx);
    expect(block).toMatch(/both now call the exact same lib\/insights\/pageRoleGate\.ts's isNoninstructionalPage\(\)\./);
  });
});
