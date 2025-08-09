import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
  })
);

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY is not set — API will return 500.");
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- /tts ----------
app.head("/tts", (req, res) => res.status(200).end());

app.post("/tts", async (req, res) => {
  try {
    const { script, voice = "alloy", format = "mp3" } = req.body || {};
    if (!script || typeof script !== "string") {
      return res
        .status(400)
        .json({ error: "Bad request: 'script' must be a non-empty string." });
    }
    if (format !== "mp3") {
      return res.status(400).json({ error: "Only 'mp3' is supported right now." });
    }

    const speech = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: script,
    });

    const arrayBuffer = await speech.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const wantsJSON =
      req.headers.accept?.includes("application/json") ||
      (typeof req.query.return === "string" &&
        req.query.return.toLowerCase() === "json");

    if (wantsJSON) {
      return res
        .status(200)
        .json({ audioBase64: buffer.toString("base64"), mimeType: "audio/mpeg" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length.toString());
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("TTS error:", err?.message || err);
    return res.status(500).json({ error: "TTS generation failed" });
  }
});

// ---------- /whiteboard-explain ----------
app.head("/whiteboard-explain", (req, res) => res.status(200).end());

app.post("/whiteboard-explain", async (req, res) => {
  try {
    const { concept, context = "General STEM explanation" } = req.body || {};
    if (!concept || typeof concept !== "string") {
      return res
        .status(400)
        .json({ error: "Bad request: 'concept' must be a non-empty string." });
    }

    const prompt = `You are Ninja Nerd giving a whiteboard explanation.

Concept: ${concept}
Context: ${context}

1. Provide a 1-paragraph summary of the concept.
2. Break it down in a clear voice script for explaining aloud to students.
3. Then give 3–6 concise whiteboard animation steps that a teacher would draw while speaking.

Return format:
Summary:
"Short summary here..."

VoiceScript:
"Your spoken explanation here..."

WhiteboardSteps:
- Step 1 drawing instructions...
- Step 2 drawing instructions...
...`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    });

    const content = completion.choices[0]?.message?.content || "";

    const summaryMatch = content.match(/Summary:\s*"([\s\S]*?)"\s*VoiceScript:/i);
    const voiceScriptMatch = content.match(/VoiceScript:\s*"([\s\S]*?)"\s*WhiteboardSteps:/i);
    const stepsBlock = content.match(/WhiteboardSteps:\s*([\s\S]*)/i);

    const summary = summaryMatch?.[1]?.trim() || "";
    const narrationScript = voiceScriptMatch?.[1]?.trim() || "";
    const rawSteps =
      stepsBlock?.[1]?.trim().split(/\n+/).map(s => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean) || [];

    const steps = rawSteps.map((line, index) => ({
      title: `Step ${index + 1}`,
      description: line,
      visualPrompt: `Illustrate: ${line}`,
    }));

    return res.status(200).json({ summary, steps, narrationScript });
  } catch (err) {
    console.error("Whiteboard explain error:", err?.message || err);
    return res.status(500).json({ error: "Failed to generate whiteboard explanation." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Whiteboard API listening on :${port}`);
});