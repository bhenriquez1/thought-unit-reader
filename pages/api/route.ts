import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { text, instructions, sentences = 4, model = "gpt-4o-mini" } = await req.json();

    if (!text || !String(text).trim()) {
      return NextResponse.json({ summary: "" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 250,
      messages: [
        { role: "system", content: "Summarize the input in concise, high-signal notes." },
        {
          role: "user",
          content:
            (instructions ? `Instructions: ${instructions}\n\n` : "") +
            `Summarize the following in ${sentences} sentences:\n\n${text}`,
        },
      ],
    });

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("summarize error:", err);
    return NextResponse.json({ error: "summarize_failed" }, { status: 500 });
  }
}