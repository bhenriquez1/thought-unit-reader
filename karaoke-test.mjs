import { chromium } from "playwright";

const SAMPLE_PDF = "/home/user/thought-unit-reader/public/sample-text.pdf";
const SCRATCHPAD = "/tmp/claude-0/-home-user-thought-unit-reader/ff31d6e0-1859-54ea-8cae-f07c8ee4418a/scratchpad";
const PORT = 3001;

async function run() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const logs = [];
  page.on("console", (msg) => {
    const t = msg.text().slice(0, 250);
    if (t.includes("[KARAOKE") || t.includes("SPEECH") || t.includes("WORD_RECT") || t.includes("activeWord")) {
      logs.push(`[${msg.type()}] ${t}`);
    }
  });

  await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log("App loaded");

  // Click the Library button to open library panel
  await page.locator("button:has-text('Library')").click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCRATCHPAD}/01-library.png` });
  console.log("Library opened");

  // Now find the hidden file input inside the library panel
  const fileInput = page.locator("input[type='file']").first();
  const count = await fileInput.count();
  console.log("File input count after opening library:", count);

  if (count > 0) {
    await fileInput.setInputFiles(SAMPLE_PDF);
    console.log("PDF uploaded");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${SCRATCHPAD}/02-after-upload.png` });
  }

  const canvas = await page.locator("canvas").count();
  const textLayer = await page.locator(".react-pdf__Page__textContent").count();
  console.log("Canvas:", canvas, "TextLayer:", textLayer);

  if (textLayer > 0) {
    const info = await page.evaluate(() => {
      function strip(s) {
        return s.toLowerCase().replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
      }
      const tl = document.querySelector('.react-pdf__Page__textContent');
      if (!tl) return { found: false };
      const spans = Array.from(tl.querySelectorAll("span")).filter(s => s.textContent?.trim());
      const texts = spans.map(s => s.textContent || "");
      const concat = texts.map(strip).join(" ");
      const words = concat.split(/\s+/).filter(w=>w.length>1);
      const phrase = words.slice(0,7).join(" ");
      return {
        spanCount: spans.length,
        firstSpans: texts.slice(0,5),
        searchPhrase: phrase,
        found: concat.includes(phrase),
        concat200: concat.slice(0,200),
      };
    });
    console.log("\n=== TEXT LAYER ===");
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log("No PDF text layer found. Taking screenshot of current state.");
    await page.screenshot({ path: `${SCRATCHPAD}/03-no-pdf.png` });
    // Print page HTML snippet
    const html = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
    console.log("Body snippet:", html);
  }

  if (logs.length) {
    console.log("\n=== Console logs ===");
    logs.forEach(l => console.log(l));
  }

  await browser.close();
}
run().catch(e=>{console.error("Error:",e.message);process.exit(1);});
