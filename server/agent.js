import { GoogleGenAI } from "@google/genai";
import { buildExtractionPrompt, buildExplanationPrompt } from "./prompts.js";
import {
  cleanJSON,
  compareWithPO,
  applyValidationRules,
  calculateRisk,
} from "./utils.js";

const DEFAULT_VALIDATION_RULES = [
  "amount must match",
  "GST must be present",
  "vendor must match",
];

const DEFAULT_MODEL = "gemini-3-flash-preview";

function isQuotaOrRateLimit(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

function parseRetryAfterMs(err) {
  const m = (err?.message || "").match(/retry in ([\d.]+)\s*s/i);
  if (m) return Math.ceil(parseFloat(m[1], 10) * 1000) + 1000;
  return null;
}

function getApiContext() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const ai = new GoogleGenAI({});
  const modelId = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  return { ai, modelId };
}

async function generateContentWithRetry(ai, modelId, contents, label) {
  const max = Math.max(
    0,
    parseInt(process.env.GEMINI_MAX_RETRIES || "5", 10) || 5
  );
  let lastErr;
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      return await ai.models.generateContent({
        model: modelId,
        contents,
      });
    } catch (e) {
      lastErr = e;
      if (!isQuotaOrRateLimit(e) || attempt === max) throw e;
      let waitMs = parseRetryAfterMs(e);
      if (waitMs == null) {
        waitMs = Math.min(90_000, 8000 * 2 ** attempt);
      }
      console.warn(
        `[${label}] rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${max + 1})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

function responseText(response) {
  const t = response?.text;
  return typeof t === "string" ? t : "";
}

export async function extractInvoiceData(invoiceText, ai, modelId) {
  const prompt = buildExtractionPrompt(
    typeof invoiceText === "string" ? invoiceText : String(invoiceText)
  );
  const result = await generateContentWithRetry(ai, modelId, prompt, "extract");
  const text = responseText(result);
  if (!text?.trim()) {
    throw new Error("Empty extraction response");
  }
  return text;
}

export async function generateExplanation(
  invoiceData,
  poData,
  issues,
  risk,
  ai,
  modelId
) {
  const prompt = buildExplanationPrompt(invoiceData, poData, issues, risk);
  const result = await generateContentWithRetry(ai, modelId, prompt, "explain");
  const text = responseText(result);
  return (text && text.trim()) || "No explanation generated.";
}

function emptyInvoiceShape() {
  return {
    invoice_number: null,
    vendor_name: null,
    amount: null,
    gst_present: null,
  };
}

export async function runReconciliationPipeline(invoiceText, poData) {
  const po = poData && typeof poData === "object" ? poData : {};
  const validation_rules = [...DEFAULT_VALIDATION_RULES];

  const safeExplain = async (
    invoiceData,
    issues,
    risk,
    ctx,
    skipLlm = false
  ) => {
    if (skipLlm) {
      if (issues.length === 0) {
        return "No issues detected. Invoice aligns with PO on amount, vendor, and GST.";
      }
      return `Issues (${risk}): ${issues.map((i) => i.message).join(" | ")}`;
    }
    try {
      return await generateExplanation(
        invoiceData,
        po,
        issues,
        risk,
        ctx.ai,
        ctx.modelId
      );
    } catch (e) {
      console.error("[agent] generateExplanation failed:", e.message);
      if (issues.length === 0) {
        return "No issues detected. Invoice aligns with PO on amount, vendor, and GST.";
      }
      return `Issues (${risk}): ${issues.map((i) => i.message).join(" | ")}`;
    }
  };

  let ctx;
  try {
    ctx = getApiContext();
  } catch (e) {
    console.error("[agent] init:", e.message);
    return {
      invoiceData: emptyInvoiceShape(),
      issues: [{ rule: "config", message: e.message }],
      risk: "HIGH",
      explanation: "API key not set. Add it to environment and restart the server.",
    };
  }

  let extractionRaw;
  try {
    extractionRaw = await extractInvoiceData(invoiceText, ctx.ai, ctx.modelId);
  } catch (e) {
    console.error("[agent] extractInvoiceData failed:", e.message);
    const quotaHit = isQuotaOrRateLimit(e);
    const issues = [
      {
        rule: "extraction",
        message: quotaHit
          ? "API quota or rate limit exceeded. Try again later."
          : `Invoice extraction failed: ${e.message}`,
      },
    ];
    const risk = calculateRisk(issues);
    const explanation = quotaHit
      ? "Rate limit or quota exceeded. Wait a bit and retry, or check your API plan. Explanation step was skipped."
      : await safeExplain(emptyInvoiceShape(), issues, risk, ctx, false);
    return {
      invoiceData: emptyInvoiceShape(),
      issues,
      risk,
      explanation,
    };
  }

  let invoice_data = emptyInvoiceShape();
  let issues = [];

  try {
    const parsed = cleanJSON(extractionRaw);
    invoice_data = {
      invoice_number:
        parsed.invoice_number != null ? String(parsed.invoice_number) : null,
      vendor_name: parsed.vendor_name != null ? String(parsed.vendor_name) : null,
      amount:
        parsed.amount != null && !Number.isNaN(Number(parsed.amount))
          ? Number(parsed.amount)
          : null,
      gst_present:
        typeof parsed.gst_present === "boolean" ? parsed.gst_present : null,
    };
  } catch (e) {
    console.error(
      "[agent] cleanJSON failed:",
      e.message,
      "| raw:",
      extractionRaw.slice(0, 300)
    );
    issues = [
      {
        rule: "parse",
        message: `Could not parse extracted invoice as JSON: ${e.message}`,
      },
    ];
    invoice_data = emptyInvoiceShape();
  }

  if (issues.length === 0) {
    issues = compareWithPO(invoice_data, po);
    issues = applyValidationRules(invoice_data, po, issues, validation_rules);
  }

  const risk = calculateRisk(issues);
  const explanation = await safeExplain(invoice_data, issues, risk, ctx);

  return {
    invoiceData: invoice_data,
    issues,
    risk,
    explanation,
  };
}
