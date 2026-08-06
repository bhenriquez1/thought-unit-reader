// pages/api/build-info.ts
// Proves which commit/deployment is actually serving requests — the gap
// this closes: a "the fix isn't in production" report is unanswerable
// without being able to check what's actually deployed. No secrets: just a
// commit SHA, when this server process started, and which environment it
// identifies as.
//
// commitSha resolution order (first present wins): Render's own
// RENDER_GIT_COMMIT, then Vercel's VERCEL_GIT_COMMIT_SHA, then the generic
// GIT_COMMIT/COMMIT_SHA/SOURCE_VERSION (Heroku) some hosts/CI set — "unknown"
// if none are present (e.g. local dev with no git-aware env injected).
//
// buildTimestamp is captured once at MODULE LOAD TIME, i.e. when this
// server process starts serving — an approximation of deploy recency, NOT
// a true compile-time build timestamp (Next.js API routes have no built-in
// way to bake in a compile-time value without a custom webpack config).
// Good enough to answer "has this process restarted since I pushed a fix,"
// not precise to the second of the actual `next build` invocation.
//
// GET /api/build-info

import type { NextApiRequest, NextApiResponse } from "next";

export interface BuildInfoResponse {
  commitSha: string;
  buildTimestamp: string;
  environmentName: string;
}

function resolveCommitSha(): string {
  return (
    process.env.RENDER_GIT_COMMIT ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT ??
    process.env.COMMIT_SHA ??
    process.env.SOURCE_VERSION ??
    "unknown"
  );
}

function resolveEnvironmentName(): string {
  return (
    process.env.RENDER_SERVICE_NAME ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "unknown"
  );
}

// Captured once when this module first loads (server process start), not
// per-request — every request in this process reports the SAME timestamp.
const BUILD_TIMESTAMP = new Date().toISOString();

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<BuildInfoResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  res.status(200).json({
    commitSha:       resolveCommitSha(),
    buildTimestamp:  BUILD_TIMESTAMP,
    environmentName: resolveEnvironmentName(),
  });
}
