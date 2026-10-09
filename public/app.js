// Partyfood.com — booking form wiring
// The form posts to an n8n webhook if WEBHOOK_URL is configured.
// Until then it falls back to opening WhatsApp with a prefilled message,
// so enquiries are never lost while you build the n8n flow.

const WEBHOOK_URL = ""; // e.g. "https://your-n8n.host/webhook/partyfood-booking"
const WHATSAPP_NUMBER = "2348130995848"; // international format, no "+" needed

const form = document.getElementById("book-form");
const note = document.getElementById("form-note");
const btn = document.getElementById("submit-btn");

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const phone = data.contact ? data.contact.trim() : "";
  if (!phone) {
    setNote("Please add a phone number or email so we can reach you.", "err");
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Sending…";
  setNote("", "");

  try {
    if (WEBHOOK_URL) {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "partyfood-site", ...data }),
      });
      if (!res.ok) throw new Error("webhook " + res.status);
      setNote("✅ Request sent! We'll get back to you shortly.", "ok");
      form.reset();
    } else {
      openWhatsApp(buildMessage(data));
      setNote("Opening WhatsApp with your request — just press send!", "ok");
    }
  } catch {
    // Never lose the lead — fall back to WhatsApp with the full message.
    openWhatsApp(buildMessage(data));
    setNote("We couldn't reach the server, so we opened WhatsApp for you.", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});
