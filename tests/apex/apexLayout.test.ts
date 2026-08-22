// tests/apex/apexLayout.test.ts
// Product-split Phase 1, item 4 — TestLab has its own route-tree shell
// (app/apex/layout.tsx) instead of every page inheriting the root layout's
// "Avrrio Reader" title with no identity of its own.

import fs from "fs";
import path from "path";

describe("app/apex/layout.tsx — TestLab's own shell", () => {
  it("REQUIRED: the layout file exists under app/apex/", () => {
    const layoutPath = path.resolve(__dirname, "../../app/apex/layout.tsx");
    expect(fs.existsSync(layoutPath)).toBe(true);
  });

  it("REQUIRED: overrides the page title to Avrrio TestLab, not the inherited 'Avrrio Reader'", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../app/apex/layout.tsx"), "utf8");
    expect(src).toMatch(/export const metadata: Metadata = \{\s*title: 'Avrrio TestLab',/);
  });

  it("passes children through unmodified — doesn't stack a second visual header on top of each page's own", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../app/apex/layout.tsx"), "utf8");
    expect(src).toMatch(/export default function ApexLayout\(\{ children \}: \{ children: React\.ReactNode \}\) \{\s*return <>\{children\}<\/>;\s*\}/);
  });
});
