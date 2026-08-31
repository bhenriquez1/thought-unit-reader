"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getAuthInstance, getDbInstance } from "@/lib/firebase";

export const DURABLE_SCHEMA_VERSION = 1;

export type CloudSaveStatus = "idle" | "saving" | "saved" | "failed" | "conflict";

export class FirebaseVersionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super("A newer version is already saved. Reload before overwriting it.");
    this.name = "FirebaseVersionConflictError";
  }
}

function firebaseErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

function safeNotebookPath(notebookId: string, pageId?: string): string {
  return pageId
    ? `users/[current-user]/notebooks/${notebookId}/pages/${pageId}`
    : `users/[current-user]/notebooks/${notebookId}`;
}

function logPersistenceFailure(operation: string, path: string, error: unknown) {
  // Deliberately excludes note text, semantic objects, tokens, config, email,
  // and the raw UID. This remains useful in production browser diagnostics.
  console.error("[FIREBASE_PERSISTENCE_ERROR]", {
    operation,
    path,
    code: firebaseErrorCode(error),
    authenticated: currentFirebaseUid() !== null,
  });
}

export function currentFirebaseUid(): string | null {
  if (typeof getAuthInstance !== "function") return null;
  return getAuthInstance()?.currentUser?.uid ?? null;
}

function requireServices() {
  const uid = currentFirebaseUid();
  const db = getDbInstance();
  if (!uid || !db) throw new Error("Sign in is required to save durable learning state.");
  return { uid, db };
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, withoutUndefined(child)])) as T;
  }
  return value;
}

export function dispatchCloudSaveStatus(status: CloudSaveStatus, resource: string, message?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("avrrio-cloud-save-status", { detail: { status, resource, message } }));
}

export interface NotebookPageCloudRecord {
  notebookId: string;
  pageId: string;
  documentId: string;
  pageTruthKey: string;
  chapterId?: string;
  topicId?: string;
  canonicalUnitIds: string[];
  tldrawSnapshot: unknown;
  semanticObjects: unknown;
  sourceAnchors: unknown[];
  version: number;
  schemaVersion: number;
}

export async function loadNotebookPage(notebookId: string, pageId: string): Promise<NotebookPageCloudRecord | null> {
  const { uid, db } = requireServices();
  const path = safeNotebookPath(notebookId, pageId);
  try {
    const snap = await getDoc(doc(db, "users", uid, "notebooks", notebookId, "pages", pageId));
    return snap.exists() ? snap.data() as NotebookPageCloudRecord : null;
  } catch (error) {
    logPersistenceFailure("get", path, error);
    throw error;
  }
}

export async function saveNotebookPage(
  value: Omit<NotebookPageCloudRecord, "version" | "schemaVersion">,
  expectedVersion: number | null,
): Promise<number> {
  const { uid, db } = requireServices();
  const notebookRef = doc(db, "users", uid, "notebooks", value.notebookId);
  const pageRef = doc(notebookRef, "pages", value.pageId);
  const parentPath = safeNotebookPath(value.notebookId);
  const pagePath = safeNotebookPath(value.notebookId, value.pageId);
  if (process.env.NODE_ENV === "development") {
    console.info("[FIREBASE_PERSISTENCE_WRITE]", {
      operation: "transaction-set",
      paths: [parentPath, pagePath],
      authenticated: true,
      uidMatchesPath: true,
      hasDocumentId: Boolean(value.documentId),
      hasPageTruthKey: Boolean(value.pageTruthKey),
    });
  }
  dispatchCloudSaveStatus("saving", `notebook:${value.notebookId}:${value.pageId}`);
  try {
    const nextVersion = await runTransaction(db, async (tx) => {
      const existing = await tx.get(pageRef);
      const currentVersion = existing.exists() ? Number(existing.data().version || 0) : 0;
      if (expectedVersion !== null && currentVersion !== expectedVersion) {
        throw new FirebaseVersionConflictError(currentVersion);
      }
      const version = currentVersion + 1;
      tx.set(notebookRef, {
        notebookId: value.notebookId,
        documentId: value.documentId,
        pageId: value.pageId,
        pageTruthKey: value.pageTruthKey,
        semanticObjects: withoutUndefined(value.semanticObjects),
        schemaVersion: DURABLE_SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
        ...(currentVersion === 0 ? { createdAt: serverTimestamp() } : {}),
      }, { merge: true });
      tx.set(pageRef, {
        ...withoutUndefined(value),
        version,
        schemaVersion: DURABLE_SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
        ...(currentVersion === 0 ? { createdAt: serverTimestamp() } : {}),
      });
      return version;
    });
    dispatchCloudSaveStatus("saved", `notebook:${value.notebookId}:${value.pageId}`);
    return nextVersion;
  } catch (error) {
    logPersistenceFailure("transaction-set", `${parentPath} + ${pagePath}`, error);
    dispatchCloudSaveStatus(error instanceof FirebaseVersionConflictError ? "conflict" : "failed", `notebook:${value.notebookId}:${value.pageId}`, String(error));
    throw error;
  }
}

export async function listNotebookSemanticStates<T>(): Promise<T[]> {
  const { uid, db } = requireServices();
  const snapshot = await getDocs(collection(db, "users", uid, "notebooks"));
  return snapshot.docs.flatMap((item) => {
    const semanticObjects = item.data().semanticObjects;
    return semanticObjects && typeof semanticObjects === "object" ? [semanticObjects as T] : [];
  });
}

export async function saveNotebookSemanticState(input: {
  notebookId: string; documentId: string; pageId: string; pageTruthKey: string;
  semanticObjects: unknown; sourceAnchors: unknown[]; canonicalUnitIds: string[];
}): Promise<void> {
  const existing = await loadNotebookPage(input.notebookId, input.pageId);
  await saveNotebookPage({ ...input, tldrawSnapshot: existing?.tldrawSnapshot ?? null }, existing?.version ?? 0);
}

export async function saveOwnedRecord(area: "stickyNotes" | "learningState" | "recall" | "tests" | "preferences", id: string, value: Record<string, unknown>) {
  const { uid, db } = requireServices();
  await setDoc(doc(db, "users", uid, area, id), {
    ...withoutUndefined(value),
    ownerUid: uid,
    schemaVersion: DURABLE_SCHEMA_VERSION,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function deleteOwnedRecord(area: "stickyNotes" | "recall" | "tests", id: string) {
  const { uid, db } = requireServices();
  await deleteDoc(doc(db, "users", uid, area, id));
}

export async function listOwnedRecords<T>(area: "stickyNotes" | "learningState" | "recall" | "tests"): Promise<T[]> {
  const { uid, db } = requireServices();
  const snapshot = await getDocs(collection(db, "users", uid, area));
  return snapshot.docs.map((item) => item.data() as T);
}

export async function saveChildState(childId: string, area: "profile" | "progress" | "rewards" | "library", id: string, value: Record<string, unknown>) {
  const { uid, db } = requireServices();
  const target = area === "profile"
    ? doc(db, "users", uid, "children", childId)
    : doc(db, "users", uid, "children", childId, area, id);
  await setDoc(target, { ...withoutUndefined(value), ownerUid: uid, schemaVersion: DURABLE_SCHEMA_VERSION, updatedAt: serverTimestamp() }, { merge: true });
}

export async function listChildProfilesCloud<T>(): Promise<T[]> {
  const { uid, db } = requireServices();
  const snapshot = await getDocs(collection(db, "users", uid, "children"));
  return snapshot.docs.map((item) => item.data() as T);
}
