# Partyfood.com

Static marketing site for Partyfood.com — Nigerian catering and Joy Sparkles
liquid soap. Plain HTML, CSS and JavaScript, no framework, no bundler.

## Layout

```
index.html              site entry: loads public/config.js, then fetches
                        public/index.html and injects it, then loads app.js
public/index.html       the actual page markup
public/styles.css       all styling
public/app.js           booking form wiring (webhook + WhatsApp fallback)
public/config.js        GENERATED runtime config — see below
public/assets/          photos, flyers and social icons
scripts/build-config.mjs  generates public/config.js from env vars
n8n/                    importable n8n workflow for booking enquiries
tests/                  headless tests for the booking form wiring
```

`index.html` is a small loader. Anything it needs at runtime — the stylesheet
and `config.js` — must be referenced from `index.html`, because injected markup
does not execute `<script>` tags. Asset paths inside `public/index.html` are
relative to it, so they read `public/assets/...` once injected.

## The booking form

The form on the site has two delivery paths:

1. **Primary — n8n webhook.** `app.js` POSTs the enquiry as JSON to the URL in
   `public/config.js`. A 10 second timeout guards a hanging webhook.
2. **Fallback — WhatsApp.** If no webhook is configured, or the request errors,
   times out or is rejected, the same message is opened in WhatsApp prefilled
   for the customer to send.

The fallback means enquiries are never silently lost, but it also means a broken
webhook looks like normal behaviour to the customer. If bookings stop appearing
in n8n, check the workflow is **active** first.

## 1. Point the form at your n8n webhook

Set the webhook URL in **one** of two ways.

**A. Edit `public/config.js` directly** — this is what GitHub Pages serves,
because it has no build step:

```js
window.PARTYFOOD_CONFIG = {
  "webhookUrl": "https://your-n8n-host/webhook/partyfood-booking",
  "whatsappNumber": "2348130995848"
};
```

**B. Use environment variables** — on a host with a build step (Vercel,
Netlify, GitHub Actions):

```bash
npm run build   # runs node scripts/build-config.mjs
```

| Variable                 | Meaning                                              |
| ------------------------ | ---------------------------------------------------- |
| `PARTYFOOD_WEBHOOK_URL`  | n8n webhook URL. Empty string = WhatsApp only.        |
| `PARTYFOOD_WHATSAPP`     | WhatsApp number, international format, digits only.   |

`npm run build` validates both (`PARTYFOOD_WEBHOOK_URL` must start with
`http://` or `https://`, the number must be 7–15 digits) and rewrites
`public/config.js`. That file starts with a "GENERATED FILE" header, so edit it
by hand only for path A.

## 2. Build the n8n workflow

Import [`n8n/partyfood-booking-webhook.json`](n8n/partyfood-booking-webhook.json)
into n8n, then **activate** the workflow. The incoming URL becomes:

```
https://<your-n8n-host>/webhook/partyfood-booking
```

Webhook node settings used:

| Setting        | Value                            |
| -------------- | -------------------------------- |
| HTTP Method    | `POST`                           |
| Path           | `partyfood-booking`              |
| Response Mode  | `onReceived` (immediate `200`)   |
| Allowed Origins (CORS) | `*`                     |

The template is a single Webhook node, so imported executions show the raw
payload. Add your own node after it — email, Google Sheets, Airtable, Slack — to
deliver the enquiry.

**CORS.** `Allowed Origins (CORS)` defaults to `*`, which is what the form needs
while the site moves between hosts (GitHub Pages now, Vercel later). Once the
final domain is settled, restrict it to that site's origin only — the full
origin including scheme, comma-separated if you need several, e.g.
`https://partyfood.com,https://www.partyfood.com`. This option covers
cross-origin requests, not a reverse proxy's own CORS layer.

**No auth by default.** The endpoint is public, like the form. Anyone who finds
the URL can post to it, so treat submissions as untrusted input and avoid
forwarding them anywhere that assumes they are genuine.

## Payload

`app.js` posts `application/json`:

```json
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
```

`source` and `submittedAt` are added by the site; the rest are the form fields
(`name`, `contact`, `eventType`, `date`, `guests`, `location`, `menuNotes`,
`notes`). Optional fields that the customer left blank arrive as empty strings.

## Tests

```bash
npm test
```

Runs [`tests/booking-form.test.mjs`](tests/booking-form.test.mjs) with Node's
built-in test runner. It loads the real `public/app.js` against a stubbed DOM and
covers: webhook delivery, the `500` and network-failure fallbacks, the
not-yet-configured WhatsApp path, and the missing-contact guard.

## Deploying

`public/` is the only directory that gets published. `sites-manifest.json`
describes that upload (`public/index.html` as entrypoint, `public` as the assets
directory) for hosts that read a manifest.
