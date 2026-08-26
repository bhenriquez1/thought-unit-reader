import type { ContentProfileId } from "@/lib/content/contentProfile";

/** Keeps OCR order intact while removing page furniture. Comic panel geometry
 * remains the authority upstream; this function never alphabetizes or ranks
 * dialogue, which would scramble the story. */
export function buildChildReadAloudText(pageText: string): string {
  return pageText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\d{1,4}$/.test(line) && !/^copyright\b/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getChildQuickPrompts(profileId: ContentProfileId): Array<{ id: string; label: string; text: string }> {
  if (profileId === "child-comic") {
    return [
      { id: "speaker", label: "Who is talking?", text: "Who is speaking on this page, and what clue shows that?" },
      { id: "first", label: "What happened first?", text: "Help me put the events on this page in order." },
      { id: "word", label: "New word", text: "Choose one useful word or sound effect from this page and explain it." },
      { id: "predict", label: "Predict next", text: "Give me one clue, then ask what I think will happen next." },
    ];
  }
  return [
    { id: "character", label: "Characters", text: "Who is on this page and what are they doing?" },
    { id: "sequence", label: "Story order", text: "Help me put the events on this page in order." },
    { id: "vocab", label: "New word", text: "Choose one useful word from this page and explain it." },
    { id: "predict", label: "Predict next", text: "Give me one clue, then ask what I think will happen next." },
  ];
}

