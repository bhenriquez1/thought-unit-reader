// lib/mindMapService.ts
import { getDbInstance } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Adds a highlighted text as a new node in the user's mind map.
 * @param text - Highlighted text from the reader
 * @param page - Optional page number for reference
 */
export async function addMindMapNode(text: string, page?: number) {
  if (!text.trim()) throw new Error("❌ Cannot add empty mind map node");

  const db = getDbInstance();
  if (!db) throw new Error("Firebase DB not initialized");

  const node = {
    label: text,
    page: page || null,
    connections: [], // optional future links
    createdAt: serverTimestamp()
  };

  await addDoc(collection(db, "mindmapNodes"), node);

  return node;
}