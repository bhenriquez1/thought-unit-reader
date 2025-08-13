// pages/api/preview-logout.ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET/POST /api/preview-logout
 * Clears the preview_auth cookie.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const isProd = process.env.NODE_ENV === "production";

  res.setHeader(
    "Set-Cookie",
    [
      `preview_auth=`,
      `Path=/`,
      `Max-Age=0`,
      `HttpOnly`,
      `SameSite=Lax`,
      isProd ? `Secure` : ``,
    ]
      .filter(Boolean)
      .join("; ")
  );

  return res.status(200).end("logged out");
}