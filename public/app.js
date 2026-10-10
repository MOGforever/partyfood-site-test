// Partyfood.com — booking form wiring
//
// Primary path: POST the enquiry as JSON to an n8n webhook. Configure the URL
// in public/config.js (generated from the PARTYFOOD_WEBHOOK_URL env var).
// Fallback path: if no webhook is configured, or the request errors, times out
// or is rejected, open WhatsApp with the same message prefilled. A booking
// enquiry must never be lost.

const CONFIG = (typeof window !== "undefined" && window.PARTYFOOD_CONFIG) || {};
const WEBHOOK_URL = String(CONFIG.webhookUrl || "").trim();
const WHATSAPP_NUMBER = String(CONFIG.whatsappNumber || "2348130995848").trim();
const REQUEST_TIMEOUT_MS = 10000;

const form = document.getElementById("book-form");
const note = document.getElementById("form-note");
const btn = document.getElementById("submit-btn");
const yearEl = document.getElementById("year");

// The site root injects this markup with innerHTML, so the inline <script> in
// public/index.html never runs. Fill the footer year from here instead.
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

function buildMessage(d) {
  const lines = [
    "🎉 *New booking request — Partyfood.com*",
    `👤 Name: ${d.name}`,
    `📞 Contact: ${d.contact}`,
    `🎪 Event: ${d.eventType}`,
    `📅 Date: ${d.date || "flexible"}`,
  ];
  if (d.guests) lines.push(`👥 Guests: ${d.guests}`);
  if (d.location) lines.push(`📍 Location: ${d.location}`);
  if (d.menuNotes) lines.push(`🍛 Menu: ${d.menuNotes}`);
  if (d.notes) lines.push(`📝 Notes: ${d.notes}`);
  return lines.join("\n");
}

function openWhatsApp(msg) {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank", "noopener");
}

function setNote(text, cls) {
  note.textContent = text;
  note.className = "form-note " + (cls || "");
}

async function sendToWebhook(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`webhook responded with HTTP ${res.status}`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

if (form && note && btn) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const contact = data.contact ? data.contact.trim() : "";
    if (!contact) {
      setNote("Please add a phone number or email so we can reach you.", "err");
      return;
    }

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Sending…";
    setNote("", "");

    try {
      if (!WEBHOOK_URL) {
        // No n8n webhook configured yet — WhatsApp is the delivery channel.
        openWhatsApp(buildMessage(data));
        setNote("Opening WhatsApp with your request — just press send!", "ok");
        return;
      }

      await sendToWebhook({
        source: "partyfood-site",
        submittedAt: new Date().toISOString(),
        ...data,
      });
      setNote("✅ Request sent! We'll get back to you shortly.", "ok");
      form.reset();
    } catch (err) {
      // Never lose the lead — fall back to WhatsApp with the full message.
      console.warn("Booking webhook failed, falling back to WhatsApp:", err);
      openWhatsApp(buildMessage(data));
      setNote("We couldn't reach the server, so we opened WhatsApp for you.", "err");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
} else {
  console.warn("Partyfood: no booking form on this page, form wiring is idle.");
}
