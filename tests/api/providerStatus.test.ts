// tests/api/providerStatus.test.ts
import fs from "fs";
import path from "path";

const ROUTE = path.resolve(__dirname, "../../pages/api/provider-status.ts");
const OLD_ROUTE = path.resolve(__dirname, "../../pages/api/chief-resident-status.ts");

describe("pages/api/provider-status.ts", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("only accepts GET", () => {
    expect(src).toMatch(/if \(req\.method !== "GET"\)/);
    expect(src).toMatch(/res\.setHeader\("Allow", "GET"\)/);
  });

  it("uses the shared providerStatus module rather than its own inline env checks", () => {
    expect(src).toMatch(/import \{ getProviderStatus, logProviderStatusOnce, PROVIDER_ROLE, type AIProvider \} from "@\/lib\/insights\/providerStatus"/);
    expect(src).not.toMatch(/process\.env\.\w+_API_KEY/);
  });

  it("logs provider status on each request via the idempotent logger", () => {
    expect(src).toMatch(/logProviderStatusOnce\(\);/);
  });

  it("response includes both providers and their roles", () => {
    expect(src).toMatch(/providers:\s*getProviderStatus\(\),/);
    expect(src).toMatch(/roles:\s*PROVIDER_ROLE,/);
  });
});

describe("pages/api/chief-resident-status.ts — retired", () => {
  it("REQUIRED: the dead, zero-caller, misleadingly-scoped endpoint was deleted, not left as unreachable dead code", () => {
    expect(fs.existsSync(OLD_ROUTE)).toBe(false);
  });
});
