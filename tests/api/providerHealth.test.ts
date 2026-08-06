// tests/api/providerHealth.test.ts
import fs from "fs";
import path from "path";

const ROUTE = path.resolve(__dirname, "../../pages/api/provider-health.ts");
const OLD_ROUTE_STATUS = path.resolve(__dirname, "../../pages/api/provider-status.ts");
const OLD_ROUTE_CHIEF = path.resolve(__dirname, "../../pages/api/chief-resident-status.ts");

describe("pages/api/provider-health.ts", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("only accepts GET", () => {
    expect(src).toMatch(/if \(req\.method !== "GET"\)/);
    expect(src).toMatch(/res\.setHeader\("Allow", "GET"\)/);
  });

  it("uses the shared providerStatus module rather than its own inline env checks", () => {
    expect(src).toMatch(/import \{ getProviderStatus, logProviderStatusOnce, type AIProvider \} from "@\/lib\/insights\/providerStatus"/);
    expect(src).not.toMatch(/process\.env\.\w+_API_KEY/);
  });

  it("logs provider status on each request via the idempotent logger", () => {
    expect(src).toMatch(/logProviderStatusOnce\(\);/);
  });

  it("REQUIRED: response shape is { provider: { configured: boolean } } for every provider — never a bare boolean, never a raw key value/length/prefix", () => {
    expect(src).toMatch(/body\[provider\] = \{ configured: status\[provider\] \};/);
    const idx = src.indexOf("const status = getProviderStatus();");
    const responseBuildingCode = src.slice(idx);
    expect(responseBuildingCode).not.toMatch(/\.length\b/);
    expect(responseBuildingCode).not.toMatch(/prefix/i);
  });
});

describe("pages/api/provider-status.ts and chief-resident-status.ts — both retired", () => {
  it("REQUIRED: provider-status.ts was renamed to provider-health.ts with the new nested-boolean shape, not left as a second overlapping endpoint", () => {
    expect(fs.existsSync(OLD_ROUTE_STATUS)).toBe(false);
  });

  it("REQUIRED: the dead, zero-caller, misleadingly-scoped chief-resident-status.ts endpoint stays deleted", () => {
    expect(fs.existsSync(OLD_ROUTE_CHIEF)).toBe(false);
  });
});
