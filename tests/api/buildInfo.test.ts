// tests/api/buildInfo.test.ts
import fs from "fs";
import path from "path";

const ROUTE = path.resolve(__dirname, "../../pages/api/build-info.ts");

describe("pages/api/build-info.ts", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("only accepts GET", () => {
    expect(src).toMatch(/if \(req\.method !== "GET"\)/);
    expect(src).toMatch(/res\.setHeader\("Allow", "GET"\)/);
  });

  it("REQUIRED: resolves commitSha with Render's own RENDER_GIT_COMMIT first, falling back through other common hosts' env vars, never assuming just one platform", () => {
    const idx = src.indexOf("function resolveCommitSha()");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/process\.env\.RENDER_GIT_COMMIT/);
    expect(block).toMatch(/process\.env\.VERCEL_GIT_COMMIT_SHA/);
    expect(block).toMatch(/process\.env\.GIT_COMMIT/);
    expect(block).toMatch(/"unknown"/);
    // RENDER_GIT_COMMIT must be checked before the generic fallbacks.
    const renderIdx = block.indexOf("RENDER_GIT_COMMIT");
    const genericIdx = block.indexOf("GIT_COMMIT ??");
    expect(renderIdx).toBeGreaterThan(-1);
    expect(genericIdx).toBeGreaterThan(renderIdx);
  });

  it("resolves environmentName similarly, with a safe default", () => {
    const idx = src.indexOf("function resolveEnvironmentName()");
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/process\.env\.RENDER_SERVICE_NAME/);
    expect(block).toMatch(/process\.env\.NODE_ENV/);
    expect(block).toMatch(/"unknown"/);
  });

  it("REQUIRED: buildTimestamp is captured once at module load, not recomputed per request — every request in this process reports the same value", () => {
    expect(src).toMatch(/const BUILD_TIMESTAMP = new Date\(\)\.toISOString\(\);/);
    // Must not be called inside the handler function body.
    const handlerIdx = src.indexOf("export default function handler(");
    const handlerBody = src.slice(handlerIdx);
    expect(handlerBody).not.toMatch(/new Date\(\)/);
  });

  it("never exposes a secret — only commitSha/buildTimestamp/environmentName, no API keys or env var values beyond these 3 identifiers", () => {
    const handlerIdx = src.indexOf("export default function handler(");
    const handlerBody = src.slice(handlerIdx);
    expect(handlerBody).not.toMatch(/_API_KEY/);
    expect(handlerBody).not.toMatch(/_LICENSE_KEY/);
  });

  it("response shape matches BuildInfoResponse: commitSha, buildTimestamp, environmentName", () => {
    expect(src).toMatch(/commitSha:\s*resolveCommitSha\(\),/);
    expect(src).toMatch(/buildTimestamp:\s*BUILD_TIMESTAMP,/);
    expect(src).toMatch(/environmentName:\s*resolveEnvironmentName\(\),/);
  });
});
