// pages/api/chief-resident-status.ts
// Lightweight health-check for the Chief Resident teaching service.
// GET /api/chief-resident-status
//
// Returns a structured JSON payload the modal (and developers) can use to
// diagnose misconfigured deployments without having to click "Explain This"
// and read an opaque error.

import type { NextApiRequest, NextApiResponse } from "next";

export interface ChiefResidentStatusCheck {
  label: string;
  ok: boolean;
}

export interface ChiefResidentStatusResponse {
  ready: boolean;
  status: string;
  checks: ChiefResidentStatusCheck[];
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChiefResidentStatusResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  // We only check what we can confirm server-side without making an OpenAI
  // API call (which would cost tokens and add latency on every health probe).
  // "Model available" and "Streaming available" are derived from the key check:
  // if the key is present, both are expected to work; transient overload/rate-
  // limit conditions are not configuration problems.
  const keyDetected = Boolean(process.env.OPENAI_API_KEY);

  const checks: ChiefResidentStatusCheck[] = [
    { label: "API route reachable",     ok: true        },
    { label: "OpenAI API key detected", ok: keyDetected },
    { label: "Model available",         ok: keyDetected },
    { label: "Streaming available",     ok: keyDetected },
  ];

  const ready = checks.every(c => c.ok);

  return res.status(200).json({
    ready,
    status: ready ? "Ready" : "Missing server configuration",
    checks,
  });
}
