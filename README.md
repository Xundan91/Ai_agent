# Invoice Reconciliation (Finance Ops)

Tool that takes messy invoice text and PO details, extracts structured data, compares against the PO, and returns issues, risk level, and a short explanation.

## Problem

Finance teams get invoices as unstructured text—emails, scans, chat, mixed language. Matching them to POs is manual and error-prone. Amount or vendor mismatches and missing GST are easy to miss, and explaining what’s wrong and what to do is slow.

## What it does

- **Extraction** — Turns raw invoice text into structured fields (invoice number, vendor, amount, GST).
- **Validation** — Compares against the PO in code: amount, vendor, GST. Same input gives the same result.
- **Risk** — 0 issues → LOW, 1 → MEDIUM, 2+ → HIGH.
- **Explanation** — A short summary of what’s wrong and what to do next.

Extraction and the final explanation use an external text API; comparison and risk are done in code so they’re repeatable and auditable.

## Pipeline

1. Extract — Raw text → JSON (`invoice_number`, `vendor_name`, `amount`, `gst_present`).
2. Clean & parse — Strip junk, parse JSON.
3. Compare — Amount vs PO, vendor vs PO, GST present.
4. Validation rules — Applied in code.
5. Risk — Computed from issue count.
6. Explanation — Generated from context.

## API

**POST /analyze**

Request:

```json
{
  "invoiceText": "string",
  "poData": { "amount": 50000, "vendor": "Acme Supplies" }
}
```

Response:

```json
{
  "invoiceData": { "invoice_number": "...", "vendor_name": "...", "amount": 50000, "gst_present": true },
  "issues": [{ "rule": "amount must match", "message": "..." }],
  "risk": "LOW | MEDIUM | HIGH",
  "explanation": "string"
}
```

## Run

**Backend**

```bash
cd invoice-agent
npm install
```

Add a `.env` file:

```env
GEMINI_API_KEY=your_key_here
PORT=3000
```

Optional: `GEMINI_MODEL`, `GEMINI_MAX_RETRIES`.

Then:

```bash
npm start
```

API is at http://localhost:3000.

**Frontend**

```bash
cd invoice-agent/client
npm install
npm run dev
```

Open http://localhost:3001. Set `NEXT_PUBLIC_API_URL` in `.env.local` if the API is elsewhere.

## Rate limits

If you hit 429 or quota errors, the server retries a few times. If it still fails, wait and retry or check your API plan. When extraction fails on quota, the app skips the explanation step so it doesn’t burn another request.

## Layout

```
invoice-agent/
├── server/
│   ├── index.js
│   ├── agent.js
│   ├── utils.js
│   └── prompts.js
├── client/
│   ├── app/
│   ├── package.json
│   └── next.config.ts
├── package.json
└── README.md
```

## Requirements

- Node 18+
- API key for the extraction/explanation service (see .env)
