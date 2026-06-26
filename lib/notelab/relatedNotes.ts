import type { UltraNote } from "@/lib/notelab/ultraNoteStore";

const STOPWORDS = new Set([
  "this", "that", "these", "those", "with", "from", "into", "onto", "about",
  "their", "there", "which", "while", "where", "when", "what", "your", "have",
  "been", "being", "were", "will", "would", "could", "should", "than", "then",
  "also", "more", "most", "some", "such", "each", "other", "another", "same",
  "page", "covered", "relates", "related", "connection", "section", "note",
  "notes", "concept", "concepts", "topic", "idea", "core",
]);

function tokenize(text: string | undefined | null): Set<string> {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return new Set(words);
}

function noteKeywordSet(note: UltraNote): Set<string> {
  const connectionMap = note.sections?.find((s) => s.label === "Connection Map")?.content;
  const combined = [connectionMap, note.topic, note.coreIdea].filter(Boolean).join(" ");
  return tokenize(combined);
}

function targetKeywordSet(note: UltraNote): Set<string> {
  const combined = [
    note.topic,
    note.coreIdea,
    ...note.concepts.map((c) => c.title),
  ]
    .filter(Boolean)
    .join(" ");
  return tokenize(combined);
}

export function findRelatedNotes(note: UltraNote, allNotes: UltraNote[], limit = 3): UltraNote[] {
  const sourceKeywords = noteKeywordSet(note);
  if (sourceKeywords.size === 0) return [];

  const scored = allNotes
    .filter((n) => n.id !== note.id)
    .map((n) => {
      const targetKeywords = targetKeywordSet(n);
      let score = 0;
      for (const word of sourceKeywords) {
        if (targetKeywords.has(word)) score += 1;
      }
      return { note: n, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.note);
}
