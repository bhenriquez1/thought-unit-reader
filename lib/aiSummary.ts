// lib/aiSummary.ts
export async function generateAISummary(text: string): Promise<string> {
  if (!text.trim()) return "No text provided for summary.";
  try {
    const res = await fetch("/api/ai-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    return data.summary || "No summary available.";
  } catch (err) {
    console.error("AI Summary failed:", err);
    return "Error generating summary.";
  }
}