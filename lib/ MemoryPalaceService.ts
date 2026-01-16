// lib/MemoryPalaceService.ts

// 🔐 MemoryPalaceService handles visual/mnemonic-based memory anchors
// for long-term recall. This can serve both Elena Mode and adult readers.

import { db, getDbInstance } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  updateDoc,
  Timestamp
} from "firebase/firestore";

export interface MemoryAnchor {
  id: string;
  userId: string;
  fileId: string;
  locationId: string; // could be page/chapter/unit ID
  childName?: string;
  imageUrl: string;
  caption: string;
  mnemonicTag?: string;
  createdAt: Timestamp;
}

const getAnchorCollection = (userId: string, fileId: string) => {
  const dbInstance = getDbInstance();
  if (!dbInstance) throw new Error('Firebase DB not initialized');
  return collection(dbInstance, "users", userId, "files", fileId, "memoryAnchors");
};

export async function saveMemoryAnchor(
  userId: string,
  fileId: string,
  anchor: Omit<MemoryAnchor, "createdAt">
): Promise<void> {
  const ref = doc(getAnchorCollection(userId, fileId), anchor.id);
  await setDoc(ref, { ...anchor, createdAt: Timestamp.now() });
}

export async function getMemoryAnchors(
  userId: string,
  fileId: string
): Promise<MemoryAnchor[]> {
  const snapshot = await getDocs(getAnchorCollection(userId, fileId));
  return snapshot.docs.map(doc => doc.data() as MemoryAnchor);
}

export async function deleteMemoryAnchor(
  userId: string,
  fileId: string,
  anchorId: string
): Promise<void> {
  const ref = doc(getAnchorCollection(userId, fileId), anchorId);
  await deleteDoc(ref);
}

export async function updateMemoryAnchor(
  userId: string,
  fileId: string,
  anchorId: string,
  updates: Partial<Omit<MemoryAnchor, "id" | "createdAt">>
): Promise<void> {
  const ref = doc(getAnchorCollection(userId, fileId), anchorId);
  await updateDoc(ref, updates);
}