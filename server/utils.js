/**
 * Deterministic tools: parsing, comparison, risk scoring.
 */

/**
 * Strip markdown code fences, leading "json", and extract first JSON object/array.
 */
export function cleanJSON(text) {
  if (text == null || typeof text !== "string") {
    throw new Error("cleanJSON: input must be a string");
  }
  let s = text.trim();
  // Remove markdown ```json ... ``` or ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  s = s.trim();
  // Remove leading "json" label if present
  s = s.replace(/^json\s*/i, "").trim();
  // Find outermost { ... } or [ ... ]
  const objStart = s.indexOf("{");
  const arrStart = s.indexOf("[");
  let start = -1;
  if (objStart >= 0 && (arrStart < 0 || objStart <= arrStart)) {
    start = objStart;
  } else if (arrStart >= 0) {
    start = arrStart;
  }
  if (start < 0) {
    throw new Error("cleanJSON: no JSON object or array found");
  }
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) {
    throw new Error("cleanJSON: unbalanced JSON braces");
  }
  const jsonSlice = s.slice(start, end);
  return JSON.parse(jsonSlice);
}

function normalizeVendor(name) {
  if (name == null || typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function amountsRoughlyEqual(a, b, tolerance = 0.01) {
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  return Math.abs(na - nb) <= tolerance;
}

/**
 * Compare extracted invoice fields against PO. Returns human-readable issues.
 */
export function compareWithPO(invoiceData, poData) {
  const issues = [];
  const poAmount = poData?.amount;
  const poVendor = poData?.vendor;

  if (invoiceData == null || typeof invoiceData !== "object") {
    issues.push({
      rule: "invoice_data",
      message: "Invoice data is missing or invalid; cannot reconcile with PO.",
    });
    return issues;
  }

  const invAmount = invoiceData.amount;
  const invVendor = invoiceData.vendor_name;

  // Amount must match
  if (invAmount == null) {
    issues.push({
      rule: "amount must match",
      message: "Invoice amount is missing or could not be extracted; cannot verify against PO.",
    });
  } else if (!amountsRoughlyEqual(invAmount, poAmount)) {
    issues.push({
      rule: "amount must match",
      message: `Amount mismatch: invoice shows ${invAmount}, PO expects ${poAmount}.`,
    });
  }

  // Vendor must match
  if (invVendor == null || String(invVendor).trim() === "") {
    issues.push({
      rule: "vendor must match",
      message: "Vendor name missing on invoice; cannot verify against PO.",
    });
  } else if (normalizeVendor(invVendor) !== normalizeVendor(poVendor)) {
    issues.push({
      rule: "vendor must match",
      message: `Vendor mismatch: invoice "${invVendor}" vs PO "${poVendor}".`,
    });
  }

  // GST must be present
  if (invoiceData.gst_present !== true) {
    issues.push({
      rule: "GST must be present",
      message:
        invoiceData.gst_present === false
          ? "GST not indicated on invoice; policy requires GST for this reconciliation."
          : "GST presence unclear or missing from extraction.",
    });
  }

  return issues;
}

/**
 * Apply additional validation rules (dedupe by rule id where useful).
 */
export function applyValidationRules(invoiceData, poData, existingIssues, rules) {
  const seen = new Set(existingIssues.map((i) => i.rule));
  const extra = [];
  for (const rule of rules || []) {
    if (seen.has(rule)) continue;
    // compareWithPO already covers these three
    if (
      rule === "amount must match" ||
      rule === "vendor must match" ||
      rule === "GST must be present"
    ) {
      continue;
    }
    extra.push({ rule, message: `Rule not satisfied: ${rule}` });
  }
  return [...existingIssues, ...extra];
}

export function calculateRisk(issues) {
  const n = Array.isArray(issues) ? issues.length : 0;
  if (n === 0) return "LOW";
  if (n === 1) return "MEDIUM";
  return "HIGH";
}
