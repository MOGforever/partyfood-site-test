// One-off check: the n8n Assistant brief must match the live site's real behaviour.
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (p) => readFileSync(root + p, "utf8");

const doc = read("n8n/ASSISTANT-PROMPT.md");
const markup = read("public/index.html");
const tmpl = JSON.parse(read("n8n/partyfood-booking-webhook.json"));
const config = read("public/config.js");

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

// 1. Documented payload keys == real form fields + source/submittedAt
const formBlock = markup.slice(
  markup.indexOf('<form class="book-form"'),
  markup.indexOf("</form>", markup.indexOf('<form class="book-form"')),
);
const formFields = [...formBlock.matchAll(/name="([a-zA-Z]+)"/g)].map((m) => m[1]);
const payloadBlock = doc.slice(
  doc.indexOf("EXACT PAYLOAD THE FORM SENDS"),
  doc.indexOf('"source" and "submittedAt" are added by the site'),
);
const docKeys = [...payloadBlock.matchAll(/^\s*"([a-zA-Z]+)":/gm)].map((m) => m[1]);

const expected = [...formFields, "source", "submittedAt"].sort();
const actual = [...new Set(docKeys)].sort();
check(
  "payload keys in brief == form fields + source/submittedAt",
  JSON.stringify(expected) === JSON.stringify(actual),
  `form: ${formFields.sort().join(",")} | doc: ${actual.join(",")}`,
);
check(
  "brief documents the real form fields (8) plus source/submittedAt",
  formFields.length === 8,
  `found ${formFields.length} form fields`,
);

// 2. Webhook contract in the brief matches the shipped template
const wh = tmpl.nodes.find((n) => n.type === "n8n-nodes-base.webhook").parameters;
check("webhook path matches template", doc.includes(`Path: ${wh.path}`), wh.path);
check("webhook method matches template", doc.includes(`HTTP Method: ${wh.httpMethod}`), wh.httpMethod);
check(
  "response mode in brief matches template",
  doc.includes("Respond: Immediately") && wh.responseMode === "onReceived",
  `template=${wh.responseMode}`,
);
check(
  "CORS allow-list in brief matches template option",
  doc.includes(`Allowed Origins (CORS): https://partyfood.com,https://www.partyfood.com,https://mogforever.github.io`) &&
    wh.options.allowedOrigins === "*",
  `template today=${wh.options.allowedOrigins}`,
);

// 3. Real contact details, no invented ones
const num = config.match(/"whatsappNumber": "(\d+)"/)[1];
check("WhatsApp number matches config.js", doc.includes(`+2348130995848`) && num === "2348130995848", num);
check("TikTok handle matches live markup", doc.includes("@partyfoodchef1") && markup.includes("@partyfoodchef1"));
check("Instagram handle matches live markup", doc.includes("@Partyfood_com") && markup.includes("@Partyfood_com"));
check("site domain claim present", doc.includes("https://mogforever.github.io/partyfood-site-test/"));

// 4. Google Sheets field names in the brief == the mapping documented in README (no drift)
const headerLabels = [
  "Received", "Name", "Contact", "Event type", "Event date",
  "Guests", "Location", "Menu", "Notes", "Source", "Submitted at",
];
for (const label of headerLabels) {
  check(`sheet column "${label}" documented`, doc.includes(`- ${label}`));
}
check(
  "brief says the 11 header labels must match the Set node",
  doc.includes("must match the header row exactly"),
);

// 5. The 10s timeout the brief warns about is real
const appJs = read("public/app.js");
check(
  "brief's 10-second timeout claim matches app.js",
  doc.includes("at most 10 seconds") && /REQUEST_TIMEOUT_MS = 10000/.test(appJs),
);
check(
  "brief's WhatsApp-fallback claim matches app.js",
  doc.includes("falls back to opening WhatsApp") && appJs.includes("openWhatsApp(buildMessage(data))"),
);

// 6. Every file the brief lists actually exists
for (const p of ["public/app.js", "public/config.js", "scripts/build-config.mjs", "n8n/partyfood-booking-webhook.json"]) {
  let ok = true;
  try { read(p); } catch { ok = false; }
  check(`listed file exists: ${p}`, ok);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
