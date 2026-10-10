// Headless tests for the booking-form wiring in public/app.js.
//
// The real script is evaluated against a stubbed DOM so we can assert what the
// form does without a browser: webhook delivery, the WhatsApp fallbacks, and
// the validation guard.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readPublic = (name) => readFileSync(resolve(here, "..", "public", name), "utf8");

const appSource = readPublic("app.js");

const silentConsole = { log() {}, warn() {}, error() {} };

function loadApp({ config = {}, fields = {}, respond } = {}) {
  const state = { opened: [], fetched: [], resets: 0 };
  const listeners = {};
  const note = { textContent: "", className: "" };
  const btn = { disabled: false, textContent: "Send booking request" };
  const form = {
    reportValidity: () => true,
    reset: () => {
      state.resets += 1;
    },
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
  };
  const elements = {
    "book-form": form,
    "form-note": note,
    "submit-btn": btn,
    year: { textContent: "" },
  };
  const win = { PARTYFOOD_CONFIG: config, open: (url) => state.opened.push(url) };
  const doc = { getElementById: (id) => elements[id] ?? null };
  const fakeFormData = class {
    entries() {
      return Object.entries(fields);
    }
  };
  const responder = respond ?? (async () => ({ ok: true, status: 200 }));
  const fakeFetch = async (url, init) => {
    state.fetched.push({ url, init });
    return responder(url, init);
  };

  const run = new Function(
    "window",
    "document",
    "console",
    "fetch",
    "FormData",
    "setTimeout",
    "clearTimeout",
    "AbortController",
    appSource,
  );
  run(
    win,
    doc,
    silentConsole,
    fakeFetch,
    fakeFormData,
    setTimeout,
    clearTimeout,
    AbortController,
  );

  assert.ok(listeners.submit, "app.js should attach a submit handler");

  return {
    state,
    note,
    btn,
    elements,
    submit: () => listeners.submit({ preventDefault() {} }),
  };
}

const booking = {
  name: "Ada Obi",
  contact: "0803 000 0000",
  eventType: "Wedding",
  date: "2026-11-02",
  guests: "80",
  location: "Bwari, Abuja",
  menuNotes: "Jollof rice + egusi",
  notes: "",
};

test("public/config.js exposes the expected config shape", () => {
  const win = {};
  new Function("window", readPublic("config.js"))(win);

  const config = win.PARTYFOOD_CONFIG;
  assert.ok(config, "config.js should define window.PARTYFOOD_CONFIG");
  assert.equal(typeof config.webhookUrl, "string");
  assert.match(config.whatsappNumber, /^\d{7,15}$/);
});

test("posts the enquiry as JSON when a webhook is configured", async () => {
  const { state, note, btn, submit } = loadApp({
    config: {
      webhookUrl: "https://n8n.example.com/webhook/partyfood-booking",
      whatsappNumber: "2348130995848",
    },
    fields: booking,
  });

  await submit();

  assert.equal(state.fetched.length, 1, "expected exactly one webhook call");
  const call = state.fetched[0];
  assert.equal(call.url, "https://n8n.example.com/webhook/partyfood-booking");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers["Content-Type"], "application/json");

  const body = JSON.parse(call.init.body);
  assert.equal(body.source, "partyfood-site");
  assert.equal(body.name, "Ada Obi");
  assert.equal(body.eventType, "Wedding");
  assert.equal(body.guests, "80");
  assert.ok(body.submittedAt, "expected a submittedAt timestamp");

  assert.deepEqual(state.opened, [], "should not open WhatsApp on success");
  assert.equal(state.resets, 1, "should reset the form on success");
  assert.match(note.textContent, /Request sent/);
  assert.equal(note.className, "form-note ok");
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, "Send booking request");
});

test("falls back to WhatsApp when the webhook returns a 500", async () => {
  const { state, note, btn, submit } = loadApp({
    config: { webhookUrl: "https://n8n.example.com/webhook/partyfood-booking" },
    fields: booking,
    respond: async () => ({ ok: false, status: 500 }),
  });

  await submit();

  assert.equal(state.fetched.length, 1);
  assert.equal(state.opened.length, 1, "expected a WhatsApp fallback");
  assert.match(state.opened[0], /^https:\/\/wa\.me\/2348130995848\?text=/);
  assert.match(decodeURIComponent(state.opened[0]), /Ada Obi/);
  assert.match(note.textContent, /couldn't reach the server/);
  assert.equal(note.className, "form-note err");
  assert.equal(btn.disabled, false);
});

test("falls back to WhatsApp when the webhook is unreachable", async () => {
  const { state, note, submit } = loadApp({
    config: { webhookUrl: "https://n8n.example.com/webhook/partyfood-booking" },
    fields: booking,
    respond: async () => {
      throw new TypeError("Failed to fetch");
    },
  });

  await submit();

  assert.equal(state.fetched.length, 1);
  assert.equal(state.opened.length, 1);
  assert.match(decodeURIComponent(state.opened[0]), /New booking request/);
  assert.equal(note.className, "form-note err");
});

test("uses WhatsApp when no webhook is configured", async () => {
  const { state, note, submit } = loadApp({
    config: { webhookUrl: "   ", whatsappNumber: "2348130995848" },
    fields: booking,
  });

  await submit();

  assert.equal(state.fetched.length, 0, "should not call fetch without a webhook");
  assert.equal(state.opened.length, 1);
  assert.match(note.textContent, /Opening WhatsApp/);
  assert.equal(note.className, "form-note ok");
});

test("blocks a submission with no contact details", async () => {
  const { state, note, submit } = loadApp({
    config: { webhookUrl: "https://n8n.example.com/webhook/partyfood-booking" },
    fields: { ...booking, contact: "   " },
  });

  await submit();

  assert.equal(state.fetched.length, 0);
  assert.deepEqual(state.opened, []);
  assert.match(note.textContent, /phone number or email/);
  assert.equal(note.className, "form-note err");
});

test("fills the footer year", () => {
  const { elements } = loadApp({ config: {} });
  assert.equal(elements.year.textContent, String(new Date().getFullYear()));
});
