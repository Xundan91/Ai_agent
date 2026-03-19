import "dotenv/config";
import express from "express";
import cors from "cors";
import { runReconciliationPipeline } from "./agent.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/analyze", async (req, res) => {
  try {
    const { invoiceText, poData } = req.body || {};

    if (invoiceText == null || String(invoiceText).trim() === "") {
      return res.status(400).json({
        error: "invoiceText is required",
        invoiceData: null,
        issues: [{ rule: "request", message: "Missing invoiceText" }],
        risk: "HIGH",
        explanation: "Provide invoice text to analyze.",
      });
    }

    const po =
      poData && typeof poData === "object"
        ? {
            amount: Number(poData.amount),
            vendor:
              poData.vendor != null ? String(poData.vendor).trim() : "",
          }
        : { amount: NaN, vendor: "" };

    if (Number.isNaN(po.amount)) {
      return res.status(400).json({
        error: "poData.amount must be a number",
        invoiceData: null,
        issues: [{ rule: "request", message: "Invalid or missing PO amount" }],
        risk: "HIGH",
        explanation: "Supply a numeric PO amount.",
      });
    }

    const result = await runReconciliationPipeline(
      String(invoiceText),
      po
    );

    res.json({
      invoiceData: result.invoiceData,
      issues: result.issues,
      risk: result.risk,
      explanation: result.explanation,
    });
  } catch (err) {
    console.error("[POST /analyze]", err);
    res.status(500).json({
      error: "Internal server error",
      invoiceData: {
        invoice_number: null,
        vendor_name: null,
        amount: null,
        gst_present: null,
      },
      issues: [
        {
          rule: "server",
          message: err.message || "Unknown error",
        },
      ],
      risk: "HIGH",
      explanation:
        "An unexpected error occurred. Check server logs and API configuration.",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "invoice-reconciliation" });
});

app.listen(PORT, () => {
  console.log(`Invoice Reconciliation listening on http://localhost:${PORT}`);
  console.log("POST /analyze — ensure API key is set in env");
});
