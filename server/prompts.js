export function buildExtractionPrompt(invoiceText) {
  return `You are a financial data extraction system used in a production finance pipeline.

Your job is to extract structured invoice data from messy, real-world text.

The input may contain:

* typos
* Hinglish (Hindi + English mix)
* incomplete sentences
* informal language

Extract the following fields:

* invoice_number (string)
* vendor_name (string)
* amount (number only, no currency symbols)
* gst_present (true or false)

Rules:

* If a field is missing, return null
* If amount is ambiguous, return null
* Normalize values (e.g., '50k' → 50000)

Output Requirements:

* Return ONLY valid JSON
* No explanation
* No markdown
* No extra text

Invoice:
${invoiceText}`;
}

export function buildExplanationPrompt(invoiceData, poData, issues, risk) {
  return `You are a finance operations assistant.

Given:
Invoice Data: ${JSON.stringify(invoiceData)}
PO Data: ${JSON.stringify(poData)}
Issues: ${JSON.stringify(issues)}
Risk Level: ${risk}

Explain:

* What is wrong
* Why it matters
* What action should be taken

Be concise and business-focused.`;
}
