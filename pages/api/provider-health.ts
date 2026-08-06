// pages/api/provider-health.ts
// Debug-facing health check: which provider keys are actually configured in
// this deployment. Booleans only — never a secret value, length, prefix, or
// fragment. See lib/insights/providerStatus.ts for what "configured" means
// and why this never makes a live provider API call.
//
// GET /api/provider-health

import type { NextApiRequest, NextApiResponse } from "next";
import { getProviderStatus, logProviderStatusOnce, type AIProvider } from "@/lib/insights/providerStatus";

export type ProviderHealthResponse = Record<AIProvider, { configured: boolean }>;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProviderHealthResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  logProviderStatusOnce();

  const status = getProviderStatus();
  const body = {} as ProviderHealthResponse;
  for (const provider of Object.keys(status) as AIProvider[]) {
    body[provider] = { configured: status[provider] };
  }

  res.status(200).json(body);
}
