// tests/insights/pageRoleGate.test.ts
// Stabilization fix — canonical noninstructional-page gate. Real
// pure-function tests against the actual exported function, not source
// regex, since isNoninstructionalPage has no React/DOM dependency.

import { isNoninstructionalPage, NONINSTRUCTIONAL_PAGE_ROLES } from "../../lib/insights/pageRoleGate";

describe("isNoninstructionalPage", () => {
  it("REQUIRED: an instructional page proceeds — regular_teaching is never suppressed", () => {
    expect(isNoninstructionalPage("regular_teaching")).toBe(false);
  });

  it("REQUIRED: table_formula (a real content page) is never suppressed", () => {
    expect(isNoninstructionalPage("table_formula")).toBe(false);
  });

  it("REQUIRED: a title/front-matter page is suppressed", () => {
    expect(isNoninstructionalPage("title_page")).toBe(true);
    expect(isNoninstructionalPage("copyright_frontmatter")).toBe(true);
    expect(isNoninstructionalPage("cover")).toBe(true);
  });

  it("suppresses every role in the canonical set", () => {
    for (const role of NONINSTRUCTIONAL_PAGE_ROLES) {
      expect(isNoninstructionalPage(role)).toBe(true);
    }
  });

  it("suppresses the full reconciled 17-role set (was previously 3 disagreeing lists of 6/13/16 roles)", () => {
    expect(NONINSTRUCTIONAL_PAGE_ROLES.size).toBe(17);
    expect([...NONINSTRUCTIONAL_PAGE_ROLES].sort()).toEqual([
      "about_authors", "acknowledgements", "appendix", "bibliography",
      "chapter_opener", "contents", "copyright_frontmatter", "cover",
      "dedication", "glossary", "image_scan_heavy", "index",
      "learning_objectives", "preface", "section_opener", "title_page",
      "unit_opener",
    ]);
  });

  it("does not suppress on null/undefined/empty pageRole — absence of a classification is never treated as noninstructional", () => {
    expect(isNoninstructionalPage(null)).toBe(false);
    expect(isNoninstructionalPage(undefined)).toBe(false);
    expect(isNoninstructionalPage("")).toBe(false);
  });

  it("does not suppress an unrecognized/unknown role string (fails open, not closed)", () => {
    expect(isNoninstructionalPage("some_future_role_not_yet_classified")).toBe(false);
  });
});
