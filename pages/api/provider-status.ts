// pages/api/provider-status.ts
// Debug-facing health check: which AI provider keys are actually configured
// in this deployment. Replaces pages/api/chief-resident-status.ts (dead —
// zero callers, and misleadingly scoped: it only ever checked OPENAI_API_KEY
// under a name shared with a DAT Apex feature that actually depends on
// ANTHROPIC_API_KEY). See lib/insights/providerStatus.ts for what "configured"
// means and why this never makes a live provider API call.
//
// GET /api/provider-status

import type { NextApiRequest, NextApiResponse } from "next";
import { getProviderStatus, logProviderStatusOnce, PROVIDER_ROLE, type AIProvider } from "@/lib/insights/providerStatus";

export interface ProviderStatusResponse {
  providers: Record<AIProvider, boolean>;
  roles: Record<AIProvider, string>;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProviderStatusResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  logProviderStatusOnce();

  res.status(200).json({
    providers: getProviderStatus(),
    roles: PROVIDER_ROLE,
  });
}
