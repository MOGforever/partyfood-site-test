// Generates public/config.js from environment variables.
//
//   PARTYFOOD_WEBHOOK_URL  n8n webhook URL for booking enquiries (empty = WhatsApp only)
//   PARTYFOOD_WHATSAPP     WhatsApp number, international format, digits only
//
// GitHub Pages has no build step, so the committed public/config.js is what it
// serves. On a host that does have one (Vercel, Netlify, GitHub Actions), set
// the variables and run `npm run build` to regenerate the file from them.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, "..", "public", "config.js");

const webhookUrl = (process.env.PARTYFOOD_WEBHOOK_URL || "").trim();
const whatsappNumber = (process.env.PARTYFOOD_WHATSAPP || "2348130995848").trim();

if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
  console.error(
    `PARTYFOOD_WEBHOOK_URL must start with http:// or https:// (got: ${webhookUrl})`,
  );
  process.exit(1);
}

if (!/^\d{7,15}$/.test(whatsappNumber)) {
  console.error(
    `PARTYFOOD_WHATSAPP must be 7-15 digits in international format (got: ${whatsappNumber})`,
  );
  process.exit(1);
}

const contents = `// GENERATED FILE — do not edit by hand.
// Produced by scripts/build-config.mjs. Regenerate with: npm run build
//
// Paste your n8n webhook URL into "webhookUrl" to send bookings to a workflow.
// Leaving it empty keeps the booking form on the WhatsApp fallback path.
window.PARTYFOOD_CONFIG = ${JSON.stringify({ webhookUrl, whatsappNumber }, null, 2)};
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, contents, "utf8");

console.log(`wrote ${outFile}`);
console.log(
  `  webhookUrl: ${webhookUrl || "(empty — the booking form falls back to WhatsApp)"}`,
);
console.log(`  whatsappNumber: ${whatsappNumber}`);
