import fs from "fs";
import path from "path";

const source = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("PDF upload perceived performance", () => {
  it("mounts a local object URL before hashing or cloud upload", () => {
    const preview = source.indexOf("const immediatePreviewUrl = createBlobUrl(file)");
    const mount = source.indexOf("setFileUrl(immediatePreviewUrl)", preview);
    const hash = source.indexOf("await hashPDFDocumentId(file)", preview);
    const cloud = source.indexOf("await uploadPDF(file, USER_ID)", preview);

    expect(preview).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(preview);
    expect(mount).toBeLessThan(hash);
    expect(mount).toBeLessThan(cloud);
  });

  it("extracts the table of contents from the already-mounted local preview", () => {
    expect(source).toMatch(/generateTOC\(immediatePreviewUrl\)/);
  });
});
