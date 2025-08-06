// lib/mindMapService.ts
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Adds a highlighted text as a new node in the user's mind map.
 * @param text - Highlighted text from the reader
 */
export async function addMindMapNode(text: string) {
  if (!text.trim()) throw new Error("Cannot add empty mind map node");

  const node = {
    label: text,
    connections: [], // later you can connect nodes by ID
    createdAt: serverTimestamp()
  };

  await addDoc(collection(db, "mindmapNodes"), node);

  return node;
}