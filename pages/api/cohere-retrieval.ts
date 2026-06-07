// pages/api/cohere-retrieval.ts
// Cohere API — related reading retrieval/ranking, related video ranking, semantic search.
// Key read from server env only — never exposed to browser.
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    console.error("[COHERE_API_KEY_MISSING] Set COHERE_API_KEY in .env.local");
    return res.status(503).json({ error: "Cohere not configured" });
  }
  // Roles: related reading retrieval/ranking, related video ranking, semantic search
  // TODO: implement Cohere call here using apiKey
  return res.status(200).json({ ok: true, provider: "cohere" });
}
