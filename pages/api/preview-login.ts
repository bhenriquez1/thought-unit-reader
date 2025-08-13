// pages/api/preview-login.ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * POST /api/preview-login
 * Body: { password: string }
 * On success: sets HttpOnly cookie "preview_auth=ok" (30 days) and returns 200
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const provided = (req.body?.password ?? "").toString();
  const expected = (process.env.APP_PREVIEW_PASSWORD ?? "").toString();

  // In production, password must be configured and must match.
  if (process.env.NODE_ENV === "production") {
    if (!expected) return res.status(500).end("Password not configured");
    if (provided !== expected) return res.status(401).end("Invalid password");
  } else {
    // In dev, if a password is set, enforce it; else allow any.
    if (expected && provided !== expected) return res.status(401).end("Invalid password");
  }

  const isProd = process.env.NODE_ENV === "production";
  // 30 days
  const maxAge = 60 * 60 * 24 * 30;

  res.setHeader(
    "Set-Cookie",
    [
      `preview_auth=ok`,
      `Path=/`,
      `Max-Age=${maxAge}`,
      `HttpOnly`,
      `SameSite=Lax`,
      isProd ? `Secure` : ``,
    ]
      .filter(Boolean)
      .join("; ")
  );

  return res.status(200).end("ok");
}