import type { NormalizedPageBlock, PageClass } from "./types";

function countKinds(blocks: NormalizedPageBlock[]) {
  return {
    headings:     blocks.filter((b) => b.kind === "heading").length,
    paragraphs:   blocks.filter((b) => b.kind === "paragraph").length,
    listItems:    blocks.filter((b) => b.kind === "list_item").length,
    tableRows:    blocks.filter((b) => b.kind === "table_row").length,
    formFields:   blocks.filter((b) => b.kind === "form_field").length,
    captions:     blocks.filter((b) => b.kind === "caption").length,
    diagrams:     blocks.filter((b) => b.kind === "diagram_label").length,
  };
}

function totalTextLength(blocks: NormalizedPageBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.text.length, 0);
}

function hasClinicalSignal(blocks: NormalizedPageBlock[]): boolean {
  const CLINICAL = [
    "diagnosis", "patient", "pain", "treatment", "clinical", "symptom",
    "history", "examination", "assessment", "lesion", "procedure", "tooth",
    "dental", "medical", "pathology", "etiology", "prognosis", "therapy",
    "pulp", "caries", "occlusion", "periodontal",
  ];
  const hay = blocks.map((b) => b.text.toLowerCase()).join(" ");
  return CLINICAL.some((term) => hay.includes(term));
}

function looksLikeFrontmatter(blocks: NormalizedPageBlock[]): boolean {
  if (!blocks.length) return false;
  if (blocks.length <= 3 && totalTextLength(blocks) < 180) return true;
  const joined = blocks.map((b) => b.text.toLowerCase()).join(" ");
  return (
    joined.includes("copyright") ||
    joined.includes("all rights reserved") ||
    joined.includes("isbn") ||
    joined.includes("published by")
  );
}

export function classifyPageType(blocks: NormalizedPageBlock[]): PageClass {
  if (!blocks.length) return "image_only";

  const counts = countKinds(blocks);
  const textLen = totalTextLength(blocks);

  if (looksLikeFrontmatter(blocks))                            return "frontmatter";
  if (textLen < 60)                                            return "sparse_text";
  if (counts.formFields >= 3)                                  return "form_checklist";
  if (counts.tableRows >= 4 && counts.paragraphs <= 2)         return "table_structured";
  if ((counts.captions + counts.diagrams) >= 2 && counts.paragraphs <= 3) return "diagram_caption";
  if (counts.formFields > 0 || counts.tableRows > 0 || counts.captions > 0) return "mixed_layout";
  if (counts.paragraphs >= 2 && hasClinicalSignal(blocks))     return "clinical_prose";
  if (counts.paragraphs >= 2)                                  return "narrative_text";
  return "sparse_text";
}
