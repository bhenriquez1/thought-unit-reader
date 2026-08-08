// tests/knowledge/knowledgeGraphIdentity.test.ts
// Regression guards for the Learning State Engine Phase A1 fix: the
// Knowledge Graph's dedup resolver (resolveOrCreateNode) used to hash and
// scope everything on raw bookId (the filename-derived key) — exactly the
// identity-collision class already fixed elsewhere in this app (see
// lib/insights/resolveDocumentIdentity.ts's own header comment). Two
// different documents sharing a filename could resolve to (or silently
// overwrite) the same KnowledgeNode. These tests guard the fix: node
// identity now hashes on the resolved documentId, with bookId kept only as
// a separate, non-identity grouping field.

import fs from "fs";
import path from "path";

const SCHEMA_FILE = path.resolve(__dirname, "../../lib/knowledge/knowledgeGraphSchema.ts");
const BUILD_FILE  = path.resolve(__dirname, "../../lib/knowledge/buildKnowledgeNode.ts");
const STORE_FILE  = path.resolve(__dirname, "../../lib/knowledge/knowledgeGraphStore.ts");
const INDEX_FILE  = path.resolve(__dirname, "../../pages/index.tsx");

describe("knowledgeGraphSchema.ts — KnowledgeNode carries a distinct documentId, not just bookId", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(SCHEMA_FILE, "utf8"); });

  it("REQUIRED: KnowledgeNode has both documentId and bookId fields", () => {
    const idx = src.indexOf("export interface KnowledgeNode {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/documentId:\s*string;/);
    expect(block).toMatch(/bookId:\s*string;/);
  });

  it("KnowledgeNodeProgress carries documentId too, and exposes the brief's LearningConceptState alias", () => {
    expect(src).toMatch(/documentId:\s+string;/);
    expect(src).toMatch(/export type LearningConceptState = KnowledgeNodeProgress;/);
  });
});

describe("buildKnowledgeNode.ts — stableNodeId hashes on documentId, not bookId", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(BUILD_FILE, "utf8"); });

  it("REQUIRED: stableNodeId takes documentId as its first parameter and hashes on it", () => {
    const idx = src.indexOf("function stableNodeId(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/function stableNodeId\(documentId: string, canonicalAnchorId: string\)/);
    expect(block).toMatch(/djb2\(`\$\{documentId\}::\$\{canonicalAnchorId\}`\)/);
  });

  it("REQUIRED: buildNewNode accepts documentId and sets it on the returned node, alongside bookId", () => {
    const idx = src.indexOf("export function buildNewNode(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/anchor: VisualAnchor,\s*\n\s*documentId: string,\s*\n\s*bookId: string,/);
    expect(block).toMatch(/id:\s*stableNodeId\(documentId, anchor\.id\),/);
    expect(block).toMatch(/documentId,\s*\n\s*bookId,/);
  });
});

describe("knowledgeGraphStore.ts — dedup resolver is documentId-scoped", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(STORE_FILE, "utf8"); });

  it("REQUIRED: IDB_VERSION was bumped and a documentId index exists alongside bookId/canonicalAnchorId", () => {
    expect(src).toMatch(/const IDB_VERSION\s*=\s*2;/);
    expect(src).toMatch(/createIndex\("documentId", "documentId"/);
  });

  it("REQUIRED: getNodesByDocument/getNodesByDocumentAndPage exist as the identity-safe equivalents of the bookId-scoped queries", () => {
    expect(src).toMatch(/export async function getNodesByDocument\(documentId: string\)/);
    expect(src).toMatch(/export async function getNodesByDocumentAndPage\(/);
  });

  it("REQUIRED: resolveOrCreateNode takes documentId as a parameter and scopes Tier-2 fuzzy matching to it, not bookId", () => {
    const idx = src.indexOf("export async function resolveOrCreateNode(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 2200);
    expect(block).toMatch(/anchor: VisualAnchor,\s*\n\s*documentId: string,\s*\n\s*bookId: string,/);
    expect(block).toMatch(/getNodesByDocumentAndPage\(documentId, pageNumber\)/);
    expect(block).toMatch(/buildNewNode\(anchor, documentId, bookId, pageNumber, chapterCandidateId, profileId\)/);
    // The old bookId-scoped Tier-2 call must not still be there.
    expect(block).not.toMatch(/getNodesByBookAndPage\(bookId, pageNumber\)/);
  });
});

describe("pages/index.tsx — the Knowledge Graph wiring effect resolves nodes against resolvedDocumentId, not bookId", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: resolveOrCreateNode is called with resolvedDocumentId as the identity argument", () => {
    const idx = src.indexOf("resolveOrCreateNode(anchor, resolvedDocumentId, bookId, currentPage, chapterCandidateId, profileId)");
    expect(idx).toBeGreaterThan(-1);
  });

  it("the KG-wiring effect runs after resolvedDocumentId is declared (no TDZ) and depends on it", () => {
    const declIdx = src.indexOf("const resolvedDocumentId = useMemo(");
    const effectIdx = src.indexOf("resolveOrCreateNode(anchor, resolvedDocumentId,");
    expect(declIdx).toBeGreaterThan(-1);
    expect(effectIdx).toBeGreaterThan(declIdx);
    const depsIdx = src.indexOf("}, [currentPageStudyModel, bookId, resolvedDocumentId, currentPage]);", effectIdx);
    expect(depsIdx).toBeGreaterThan(-1);
  });
});
