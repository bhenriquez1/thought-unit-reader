// lib/knowledge/knowledgeGraphStore.ts
// IDB-primary persistence for the Knowledge Graph.
//
// Deduplication rule (immutable):
//   No AI pipeline may create a KnowledgeNode without first searching.
//   All callers MUST use resolveOrCreateNode — the only public entry point
//   for node creation. Direct idbPutNode calls are intentionally private.
//
// Tier 1: exact canonicalAnchorId match   — O(1) IDB index, deterministic
// Tier 2: fuzzy same-page title overlap   — O(n) over page's nodes, ≥ FUZZY_THRESHOLD
// Tier 3: genuinely new concept           — create and persist

import type { KnowledgeNode, KnowledgeNodeProgress, SourceCitation } from "./knowledgeGraphSchema";
import type { VisualAnchor } from "@/lib/insights/currentPageStudyModel";
import { buildNewNode, tokenOverlap } from "./buildKnowledgeNode";

// ── Constants ─────────────────────────────────────────────────────────────────

const IDB_NAME        = "avrrio_knowledgegraph_v1";
const IDB_VERSION     = 1;
const NODES_STORE     = "nodes";
const PROGRESS_STORE  = "progress";
const FUZZY_THRESHOLD = 0.85;

// ── IDB open ─────────────────────────────────────────────────────────────────

function openKnowledgeGraphIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IDB unavailable")); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NODES_STORE)) {
        const store = db.createObjectStore(NODES_STORE, { keyPath: "id" });
        store.createIndex("bookId",            "bookId",            { unique: false });
        store.createIndex("canonicalAnchorId", "canonicalAnchorId", { unique: false });
      }
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        db.createObjectStore(PROGRESS_STORE, { keyPath: "nodeId" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB blocked — close other tabs"));
  });
}

// ── Private write ─────────────────────────────────────────────────────────────

async function idbPutNode(node: KnowledgeNode): Promise<void> {
  const db = await openKnowledgeGraphIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NODES_STORE, "readwrite");
    tx.objectStore(NODES_STORE).put(node);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Private index read ────────────────────────────────────────────────────────

async function idbGetByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openKnowledgeGraphIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).index(indexName).getAll(value);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── Public read API ───────────────────────────────────────────────────────────

export async function getNodeByAnchor(canonicalAnchorId: string): Promise<KnowledgeNode | null> {
  const results = await idbGetByIndex<KnowledgeNode>(NODES_STORE, "canonicalAnchorId", canonicalAnchorId);
  return results[0] ?? null;
}

export async function getNodesByBook(bookId: string): Promise<KnowledgeNode[]> {
  return idbGetByIndex<KnowledgeNode>(NODES_STORE, "bookId", bookId);
}

export async function getNodesByBookAndPage(
  bookId: string,
  pageNumber: number,
): Promise<KnowledgeNode[]> {
  const all = await getNodesByBook(bookId);
  return all.filter(n => n.sourcePages.includes(pageNumber));
}

export async function getNodeProgress(nodeId: string): Promise<KnowledgeNodeProgress | null> {
  const db = await openKnowledgeGraphIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PROGRESS_STORE, "readonly");
    const req = tx.objectStore(PROGRESS_STORE).get(nodeId);
    req.onsuccess = () => resolve((req.result as KnowledgeNodeProgress) ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveNodeProgress(progress: KnowledgeNodeProgress): Promise<void> {
  const db = await openKnowledgeGraphIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROGRESS_STORE, "readwrite");
    tx.objectStore(PROGRESS_STORE).put(progress);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Citation back-fill ────────────────────────────────────────────────────────
// Called when tier-2 fuzzy match reuses a node but finds a new canonicalAnchorId
// pointing at it. Adds the new anchor to the node's citations[] and sourcePages[].

async function addAnchorToCitations(
  nodeId: string,
  anchorId: string,
  sourceText: string,
  page: number,
): Promise<void> {
  const db = await openKnowledgeGraphIDB();
  const node: KnowledgeNode | undefined = await new Promise((resolve, reject) => {
    const tx  = db.transaction(NODES_STORE, "readonly");
    const req = tx.objectStore(NODES_STORE).get(nodeId);
    req.onsuccess = () => resolve(req.result as KnowledgeNode);
    req.onerror   = () => reject(req.error);
  });
  if (!node) return;
  if (node.citations.some(c => c.anchorId === anchorId)) return;

  const newCitation: SourceCitation = {
    anchorId,
    sourceText,
    page,
    sourceLabel: "Textbook",
    confidence:  0.7,
  };
  await idbPutNode({
    ...node,
    citations:   [...node.citations, newCitation],
    sourcePages: Array.from(new Set([...node.sourcePages, page])),
  });
}

// ── Deduplication resolver ────────────────────────────────────────────────────
// The ONLY public entry point for creating or retrieving a node.
// Never call idbPutNode directly from outside this module.

export async function resolveOrCreateNode(
  anchor: VisualAnchor,
  bookId: string,
  pageNumber: number,
  chapterCandidateId: string | null,
  profileId: string,
): Promise<KnowledgeNode> {
  // Tier 1 — exact anchor match (free, deterministic)
  const byAnchor = await getNodeByAnchor(anchor.id);
  if (byAnchor) {
    if (!byAnchor.sourcePages.includes(pageNumber)) {
      await addAnchorToCitations(byAnchor.id, anchor.id, anchor.exactText, pageNumber);
    }
    return byAnchor;
  }

  // Tier 2 — fuzzy match on same page
  const pageNodes = await getNodesByBookAndPage(bookId, pageNumber);
  const fuzzy = pageNodes.find(
    n =>
      tokenOverlap(n.title, anchor.role) >= FUZZY_THRESHOLD ||
      tokenOverlap(n.exactSourceText, anchor.exactText) >= FUZZY_THRESHOLD,
  );
  if (fuzzy) {
    await addAnchorToCitations(fuzzy.id, anchor.id, anchor.exactText, pageNumber);
    console.log("[KG] tier-2 reuse", { nodeId: fuzzy.id, anchorId: anchor.id, page: pageNumber });
    return fuzzy;
  }

  // Tier 3 — new concept
  const node = buildNewNode(anchor, bookId, pageNumber, chapterCandidateId, profileId);
  await idbPutNode(node);
  console.log("[KG] tier-3 create", { nodeId: node.id, role: anchor.role, page: pageNumber });
  return node;
}
