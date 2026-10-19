# Partyfood.com → n8n build brief

Everything you need to hand this job to **n8n's AI Assistant** (the *Build with AI* chat in
the n8n editor). Part 1 is the summary of what already exists. Part 2 is the few values you
must fill in. Part 3 is the block you copy and paste into the Assistant.

---

## Part 1 — What already exists

**The site.** Partyfood.com — a static marketing site (plain HTML/CSS/JS, no framework) for a
Nigerian catering business, plus her Joy Sparkles liquid soap line. Live test copy:
https://mogforever.github.io/partyfood-site-test/

**The booking form is already wired to n8n.** When a customer submits it, `public/app.js`
POSTs the enquiry as JSON with a 10-second timeout:

1. **Primary** — the n8n webhook. Configured via `webhookUrl` in `public/config.js`.
2. **Fallback** — if no webhook is configured, or the request errors/times out/is rejected,
   the same message opens in WhatsApp prefilled. An enquiry is never silently lost.

Because of that fallback, **a broken webhook looks exactly like normal behaviour to the
customer** — they just get WhatsApp instead. A silent workflow failure is invisible from the
outside, which is why the notification channels below matter.

**What's in the repo.**

| Path | What it is |
| --- | --- |
| `public/app.js` | form wiring: webhook POST, timeout, WhatsApp fallback |
| `public/config.js` | generated runtime config — `webhookUrl` + `whatsappNumber` |
| `scripts/build-config.mjs` | regenerates `config.js` from `PARTYFOOD_WEBHOOK_URL` / `PARTYFOOD_WHATSAPP` |
| `n8n/partyfood-booking-webhook.json` | importable single-node template: the webhook only, no delivery steps |
| `n8n/ASSISTANT-PROMPT.md` | this file |
| `README.md` | setup, payload reference, CORS notes |

**Webhook contract the site already expects** (from the existing template):

| Setting | Value |
| --- | --- |
| HTTP Method | `POST` |
| Path | `partyfood-booking` |
| Response Mode | immediate `200` |
| Allowed Origins (CORS) | `*` today; should become the real domain(s) |

**What's missing — the job for the Assistant.** The template stops at the webhook, so today an
enquiry arrives and goes nowhere. There is no logging, no email, no WhatsApp or Telegram alert.

**Her contact details used by the site:** WhatsApp `+234 813 099 5848` (also the `tel:` link
in the hero), Instagram `@Partyfood_com`, TikTok `@partyfoodchef1`.

---

## Part 2 — Fill these in before pasting

| ⬜ | Value | Notes |
| --- | --- | --- |
| 1 | Her email address | Where order alerts should land. |
| 2 | Google Sheet | Create a sheet named **Partyfood orders**, tab **Orders**, with the header row in Part 3 §2. Or let the Assistant tell you it can't find it. |
| 3 | Meta WhatsApp template name | Must be an approved **Utility**-category template (see §4). If you don't have one yet, this is the one channel that can't work today — send the prompt anyway and keep that node disabled. |
| 4 | Telegram bot + her chat ID | Optional. Create a bot with **@BotFather**, have her send it `/start`, then read the `chat.id` from a Telegram Trigger run. |
| 5 | Final domain | `https://partyfood.com` etc., for the CORS allow-list. |

Nothing else. **Do not paste passwords, tokens or API keys into the Assistant** — it doesn't
take them. Credentials are connected by hand in n8n's credential screens afterwards.

---

## Part 3 — Copy everything below into the n8n AI Assistant

```text
Build one n8n workflow named "Partyfood.com — booking enquiries".

CONTEXT
Partyfood.com is a small Nigerian catering business. Its website booking form POSTs each
enquiry as JSON to this workflow. Every new order must reach the owner in three ways — a
spreadsheet, her email, and her WhatsApp (plus Telegram if it's easy) — and the customer's
browser must get an instant success response.

NON-NEGOTIABLE: REPLY TO THE BROWSER IMMEDIATELY.
The form's JavaScript waits at most 10 seconds for a 2xx response. If it times out or gets an
error, it falls back to opening WhatsApp and the workflow's log line is never written. So the
webhook must reply 200 right away, BEFORE any logging or notification work runs. Never make
the customer wait on Sheets, email or WhatsApp.

1. TRIGGER — Webhook node
   - HTTP Method: POST
   - Path: partyfood-booking  (keep this exact path; the live site is already pointed at it)
   - Authentication: None
   - Respond: Immediately  (so the 200 goes out on receipt, not after the last node)
   - Response: HTTP 200, JSON body {"success": true}
   - Options → Allowed Origins (CORS): https://partyfood.com,https://www.partyfood.com,https://mogforever.github.io
   If you'd rather use a "Respond to Webhook" node, place it directly on the main path before
   the logging nodes — but "Respond: Immediately" is simpler and preferred here.

   EXACT PAYLOAD THE FORM SENDS — all values are strings; optional fields arrive as "" when the
   customer left them blank. Use these key names verbatim:
   {
     "source": "partyfood-site",
     "submittedAt": "2026-10-10T19:45:00.000Z",
     "name": "Ada Obi",
     "contact": "0803 000 0000",
     "eventType": "Wedding",
     "date": "2026-11-02",
     "guests": "80",
     "location": "Bwari, Abuja",
     "menuNotes": "Jollof rice + egusi for 100 guests",
     "notes": "No peanuts"
   }
   "source" and "submittedAt" are added by the site; the rest are form fields. Note there is no
   separate phone/email field — "contact" is whatever the customer typed.

2. LOG TO GOOGLE SHEETS
   Add an "Edit Fields" (Set) node named "Clean order fields" that outputs exactly these 11
   fields, then a Google Sheets node that appends one row per run:
   - Received      -> current time in Africa/Lagos, e.g. {{ $now.setZone('Africa/Lagos').toFormat('dd LLL yyyy, HH:mm') }}
   - Name          -> {{ $json.name }}
   - Contact       -> {{ $json.contact }}
   - Event type    -> {{ $json.eventType }}
   - Event date    -> {{ $json.date }}
   - Guests        -> {{ $json.guests }}
   - Location      -> {{ $json.location }}
   - Menu          -> {{ $json.menuNotes }}
   - Notes         -> {{ $json.notes }}
   - Source        -> {{ $json.source }}
   - Submitted at  -> {{ $json.submittedAt }}
   Turn OFF "Include Other Fields". In the Google Sheets node use:
   - Resource: Sheet Within Document, Operation: Append Row
   - Spreadsheet: Partyfood orders   (select it from the list myself — see CREDENTIALS below)
   - Sheet: Orders
   - Columns: Map Automatically (the field names above must match the header row exactly)
   The first row of the sheet must contain exactly those 11 header labels. If the spreadsheet
   or tab doesn't exist, ASK ME instead of guessing an ID.

3. EMAIL HER
   Use the "Send Email" (SMTP) node as the primary route — I'll connect SMTP credentials.
   To: <HER EMAIL>
   Subject: New Partyfood booking — {{ $json.eventType }} on {{ $json.date }}
   Body (plain text):
     New booking request from the website.

     Name:      {{ $json.name }}
     Contact:   {{ $json.contact }}
     Event:     {{ $json.eventType }}
     Date:      {{ $json.date }}
     Guests:    {{ $json.guests }}
     Location:  {{ $json.location }}
     Menu:      {{ $json.menuNotes }}
     Notes:     {{ $json.notes }}
     Received:  {{ $now.setZone('Africa/Lagos').toFormat('dd LLL yyyy, HH:mm') }}
   Also mention in a sticky note that the identical field mapping works in the "Gmail" node
   (Send → Message) if I later switch this channel to Gmail — but do not build both.

4. WHATSAPP HER — WhatsApp Business Cloud, template message
   Reality check: this is Meta's WhatsApp Business Platform. Business-initiated messages
   outside a 24-hour customer service window must use an APPROVED TEMPLATE, so a plain
   free-text send will not work reliably here. Build it as:
   - Node: WhatsApp Business Cloud, Resource: Message, Operation: Send Template
   - To: +2348130995848
   - Template: <TEMPLATE NAME>  (Utility category, approved in Meta Business Manager)
   - Body variables, in order:
       1) {{ $json.name }}          (customer name)
       2) {{ $json.eventType }} on {{ $json.date }}
       3) {{ $json.contact }}
       4) {{ $json.guests }} guests — {{ $json.location }}
   If I don't give you an approved template name, leave this node DISABLED with a sticky note
   explaining what's needed — do not fake a working WhatsApp send or substitute a personal
   account, and do not silently drop the step.

5. TELEGRAM HER (optional second alert)
   - Node: Telegram, Resource: Message, Operation: Send Message
   - Credentials: Telegram API (bot token from @BotFather — I'll connect it)
   - Chat ID: <TELEGRAM CHAT ID>  (she must send /start to the bot once before it can message her)
   - Text: same summary as the email body, compressed onto a few lines with the emoji header
     "🎉 New Partyfood booking".

6. WIRING AND RELIABILITY
   - Fan out: after "Clean order fields", run Google Sheets, Email, WhatsApp and Telegram as
     PARALLEL branches, not a chain. One channel must never block the others.
   - Set every one of those four nodes to continue on error (On Error → Continue, or
     "Continue On Fail"), because the browser has already been told 200 and a single broken
     channel must not stop the rest of the delivery.
   - Turn on saving failed executions so I can see when a channel breaks.
   - One Webhook node only. Don't add a second trigger, a Form trigger or a queue.
   - Sanitise nothing away: keep the customer's text as text. But treat every field as
     untrusted input — no formulas or code built from it.

CREDENTIALS
Do not put credentials, tokens or passwords in the workflow or ask me for them in chat.
Create the nodes with empty credential slots and tell me which credential type to connect in
n8n's credential screens. I'll do that part by hand.

BEFORE YOU FINISH
- Show me the finished workflow and ASK before activating or publishing it.
- Tell me the exact production webhook URL and how to test it, and remind me that this URL has
  to be copied into the website's config (public/config.js → "webhookUrl").
- If any value is missing — spreadsheet ID, sheet name, chat ID, phone number ID, template
  name, email address — ASK me. Do not invent placeholder values, and do not activate a
  workflow pointing at something you made up.
- Finish with a short list of the manual steps I still have to do.
```

---

## Part 4 — After the Assistant builds it

1. **Connect credentials** in each node: Google Sheets (OAuth2), SMTP (host, port, her email +
   app password), WhatsApp Business Cloud (business account ID, phone number ID, permanent
   access token), Telegram (bot token).
2. **Create the sheet** — `Partyfood orders` / tab `Orders` — and paste the 11 header labels
   from §2 into row 1, or the append will create junk columns.
3. **Activate the workflow**, then copy the **Production** webhook URL — not the Test one —
   into `public/config.js`:

   ```js
   window.PARTYFOOD_CONFIG = {
     "webhookUrl": "https://<your-n8n-host>/webhook/partyfood-booking",
     "whatsappNumber": "2348130995848"
   };
   ```

   Push that, and every new booking lands in the workflow.
4. **Test with a real submission** on the live form, then confirm the row, the email and the
   alert all arrived. Testing the webhook with `curl` only proves the trigger works.
5. **Tighten CORS** to the final domain once the site stops moving between hosts.

### Things that will bite

- **The WhatsApp template is the long pole.** A WhatsApp Business account, a verified number
  and an approved Utility template have to exist before that node can send anything. Email and
  Telegram have no such gate — that's why they're worth having even if WhatsApp is the one she
  cares about.
- **`Respond: Immediately` matters.** If the browser waits on the whole workflow and takes more
  than 10 seconds, the form silently falls back to WhatsApp and n8n still logs a success.
- **The webhook is public.** Anyone who finds the URL can post to it. Treat submissions as
  untrusted and don't wire them into anything that assumes they're genuine.
- **Her email address is unknown to the repo** — there's no address anywhere in the site yet,
  only the phone number. Fill it in before pasting §3.
