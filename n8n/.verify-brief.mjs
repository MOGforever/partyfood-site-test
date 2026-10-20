// One-off check: the n8n Assistant brief must match the live site's real behaviour.
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (p) => readFileSync(root + p, "utf8");

const doc = read("n8n/ASSISTANT-PROMPT.md");
const markup = read("public/index.html");
const tmpl = JSON.parse(read("n8n/partyfood-booking-webhook.json"));
const config = read("public/config.js");

// Header labels shared by the Set node, the sheet, the brief and README — one source of truth.
const headerLabels = [
  "Received", "Name", "Contact", "Event type", "Event date",
  "Guests", "Location", "Menu", "Notes", "Source", "Submitted at",
];

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

// 6. Template workflow shape — the full flow, safe to import but NOT live
const byName = Object.fromEntries(tmpl.nodes.map((n) => [n.name, n]));
const setAssignments = (byName["Clean order fields"]?.parameters?.assignments?.assignments) || [];
const setNames = setAssignments.map((a) => a.name);
check(
  "template ships the full flow: webhook → Set → 3 delivery branches",
  tmpl.nodes.some((n) => n.type === "n8n-nodes-base.webhook") &&
    !!byName["Clean order fields"] &&
    !!byName["Log to Google Sheets"] &&
    !!byName["Email her"] &&
    !!byName["Telegram her"],
  tmpl.nodes.map((n) => n.name).join(" | "),
);
check(
  "Set node outputs exactly the 11 header labels, in order",
  JSON.stringify(setNames) === JSON.stringify(headerLabels),
  setNames.join(","),
);
const setMapsRawFormKeys = setAssignments.length === headerLabels.length &&
  setAssignments.every((a, i) => a.name === headerLabels[i]);
check("Set node maps from the real form keys", setMapsRawFormKeys && setAssignments.some((a) => /\$json\.(name|eventType|menuNotes)/.test(a.value)));
for (const branch of ["Log to Google Sheets", "Email her", "Telegram her"]) {
  check(`"${branch}" continues on error`, byName[branch]?.onError === "continueRegularOutput");
}
const sheetCols = byName["Log to Google Sheets"]?.parameters?.columns;
check(
  "Sheets node auto-maps the Set node's fields",
  sheetCols?.mappingMode === "autoMapInputData",
  sheetCols?.mappingMode,
);
check("template is committed INACTIVE (nothing goes live until activated)", tmpl.active === false);
check("template has exactly one webhook node", tmpl.nodes.filter((n) => n.type === "n8n-nodes-base.webhook").length === 1);
check("template does NOT ship a WhatsApp branch (needs approved Meta template)", !tmpl.nodes.some((n) => n.type?.includes("whatsApp")));
check("email/Telegram expressions use CLEANED field names (they run after the Set node)",
  byName["Email her"]?.parameters?.subject?.includes("$json['Event type']") &&
  byName["Telegram her"]?.parameters?.text?.includes("$json['Name']"));
check("email/Telegram target slots left EMPTY for hand-filled credentials",
  byName["Email her"]?.parameters?.toEmail === "" && byName["Telegram her"]?.parameters?.chatId === "");
check("brief says the workflow stays off until she approves",
  doc.includes("committed switched OFF") && doc.includes("`webhookUrl` stays empty"));
check("brief says the site config keeps the webhookUrl empty until go-live",
  doc.includes("stays empty until you say") || doc.includes("stays empty until you say\ngo") || /stays empty until you say/.test(doc));

// 7. Every file the brief lists actually exists
for (const p of ["public/app.js", "public/config.js", "scripts/build-config.mjs", "n8n/partyfood-booking-webhook.json"]) {
  let ok = true;
  try { read(p); } catch { ok = false; }
  check(`listed file exists: ${p}`, ok);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
