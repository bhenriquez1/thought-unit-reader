// pages/api/gemini-visual.ts
// Gemini API — visual planning, table/figure interpretation, drawing plan support.
// Key read from server env only — never exposed to browser.
const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    DEV && console.error("[GEMINI_API_KEY_MISSING] Set GEMINI_API_KEY in .env.local");
    return res.status(503).json({ error: "Gemini not configured" });
  }
  // Roles: whiteboard visual planning, tables/figures/diagram interpretation, drawing plan support
  // TODO: implement Gemini call here using apiKey
  return res.status(200).json({ ok: true, provider: "gemini" });
}
