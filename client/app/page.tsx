"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const SAMPLE_INVOICE = `Invoice #INV-2024-1087
Acme Supplies Pvt Ltd
GSTIN: 27AABCU9603R1ZM

Bill to: XYZ Corp
Amount: Rs 48,500 (Forty Eight Thousand Five Hundred)
GST included.

Due: 30 days.`;
const SAMPLE_PO_AMOUNT = "50000";
const SAMPLE_PO_VENDOR = "Acme Supplies Pvt Ltd";

type Issue = { rule: string; message: string };
type InvoiceData = {
  invoice_number: string | null;
  vendor_name: string | null;
  amount: number | null;
  gst_present: boolean | null;
};
type Result = {
  invoiceData: InvoiceData;
  issues: Issue[];
  risk: string;
  explanation: string;
};

type Tab = "analyze" | "problem" | "backend";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("analyze");
  const [invoiceText, setInvoiceText] = useState(SAMPLE_INVOICE);
  const [poAmount, setPoAmount] = useState(SAMPLE_PO_AMOUNT);
  const [poVendor, setPoVendor] = useState(SAMPLE_PO_VENDOR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function handleAnalyze() {
    setError("");
    setResult(null);
    if (!invoiceText.trim()) {
      setError("Invoice text is required.");
      return;
    }
    const amount = Number(poAmount);
    if (poAmount === "" || Number.isNaN(amount)) {
      setError("Enter a valid PO amount.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceText: invoiceText.trim(),
          poData: { amount, vendor: poVendor.trim() },
        }),
      });
      const data: Result & { error?: string } = await res.json();
      setResult({
        invoiceData: data.invoiceData,
        issues: data.issues ?? [],
        risk: data.risk ?? "—",
        explanation: data.explanation ?? "",
      });
      if (!res.ok) setError(data.error || data.explanation || "Request failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1 className="title">Invoice Reconciliation</h1>
        <p className="subtitle">Sample data is pre-filled. Click Analyze to run the pipeline.</p>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === "analyze" ? "tabActive" : ""}`}
          onClick={() => setActiveTab("analyze")}
        >
          Analyze
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "problem" ? "tabActive" : ""}`}
          onClick={() => setActiveTab("problem")}
        >
          Problem & solution
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "backend" ? "tabActive" : ""}`}
          onClick={() => setActiveTab("backend")}
        >
          How the backend works
        </button>
      </nav>

      {activeTab === "problem" && (
        <section className="backendExplanation problemSolution">
          <h2 className="backendTitle">Problem & solution</h2>

          <h3 className="problemSubtitle">The problem</h3>
          <p className="backendIntro">
            Finance and operations teams receive invoices in messy, unstructured form: email text, scanned notes, chat messages, or mixed language (e.g. Hinglish). Matching these to Purchase Orders (POs) is manual and error-prone. Amount mismatches, wrong vendors, or missing GST are easy to miss. When they are found, explaining <em>what</em> is wrong and <em>what to do</em> to stakeholders takes extra time. The result: delayed approvals, rework, and risk of paying incorrect or non-compliant invoices.
          </p>

          <h3 className="problemSubtitle">How we solve it</h3>
          <p className="backendIntro">
            A fixed pipeline does two things: it <em>extracts</em> structured data from the raw invoice text and turns it into a short explanation, and it <em>decides</em> in code whether amounts/vendor/GST match the PO and what risk level to assign. Pass/fail and risk are always computed the same way for the same inputs; only the wording of the explanation is generated. That keeps results consistent and auditable.
          </p>

          <h3 className="problemSubtitle">How it solves the business problem</h3>
          <ul className="backendSteps businessList">
            <li><strong>Faster reconciliation</strong> — One click turns raw invoice text into structured data and a clear list of issues, instead of manual reading and cross-checking.</li>
            <li><strong>Fewer errors</strong> — Deterministic checks (amount, vendor, GST) catch mismatches consistently; risk levels (LOW / MEDIUM / HIGH) prioritize what needs review.</li>
            <li><strong>Clear next steps</strong> — The explanation states what is wrong, why it matters, and what action to take, so approvers and finance can act without guessing.</li>
            <li><strong>Audit-friendly</strong> — Rules and risk are driven by code, so the logic can be reviewed and explained to auditors.</li>
          </ul>
        </section>
      )}

      {activeTab === "backend" && (
        <section className="backendExplanation">
          <h2 className="backendTitle">How the backend works</h2>
          <p className="backendIntro">
            The pipeline has six steps. Extraction and the final explanation use an external text service; the rest is plain code.
          </p>
          <ol className="backendSteps">
            <li>
              <strong>Step 1 — Extract</strong><br />
              Raw invoice text (typos, mixed language, informal) is sent to the extraction service. It returns structured JSON: <code>invoice_number</code>, <code>vendor_name</code>, <code>amount</code>, <code>gst_present</code>. Normalization (e.g. &quot;50k&quot; → 50000) happens here.
            </li>
            <li>
              <strong>Step 2 — Clean & parse (code)</strong><br />
              <code>cleanJSON</code> strips markdown or extra text around the response and parses JSON safely. If parsing fails, the pipeline records a parse issue and skips comparison.
            </li>
            <li>
              <strong>Step 3 — Compare with PO (code)</strong><br />
              <code>compareWithPO</code> checks: amount matches PO (with small tolerance), vendor name matches PO (normalized), and GST is present. Each violation becomes an issue.
            </li>
            <li>
              <strong>Step 4 — Validation rules (code)</strong><br />
              Rules like &quot;amount must match&quot;, &quot;GST must be present&quot;, &quot;vendor must match&quot; are applied. Same input always gives the same pass/fail.
            </li>
            <li>
              <strong>Step 5 — Risk (code)</strong><br />
              <code>calculateRisk</code>: 0 issues → LOW, 1 → MEDIUM, 2+ → HIGH. All in code.
            </li>
            <li>
              <strong>Step 6 — Explanation</strong><br />
              The extracted data, PO, issues, and risk level are sent to the same service to produce a short business explanation: what is wrong, why it matters, what action to take.
            </li>
          </ol>
          <p className="backendNote">
            Rules and risk are computed in code so they are repeatable; only extraction and the final explanation use the external service.
          </p>
        </section>
      )}

      {activeTab === "analyze" && (
        <>
          <section className="instructions">
            <h2 className="instructionsTitle">How to use</h2>
            <ol className="instructionsList">
              <li>Invoice text, PO amount, and PO vendor are pre-filled with sample data. You can edit them if you like.</li>
              <li>Click <strong>Analyze</strong>. The backend runs the pipeline and returns extracted data, issues, risk, and an explanation.</li>
              <li>The first request may take 30–60 seconds if the backend is waking from sleep (cold start).</li>
            </ol>
          </section>

          <section className="form">
            <label className="label">Invoice text</label>
            <textarea
              className="input textarea"
              placeholder="Invoice text…"
              value={invoiceText}
              onChange={(e) => setInvoiceText(e.target.value)}
              rows={8}
            />

        <div className="row">
          <div className="field">
            <label className="label">PO amount</label>
            <input
              type="number"
              className="input"
              placeholder="e.g. 50000"
              step="0.01"
              value={poAmount}
              onChange={(e) => setPoAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">PO vendor</label>
            <input
              type="text"
              className="input"
              placeholder="Vendor name"
              value={poVendor}
              onChange={(e) => setPoVendor(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="button"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading
            ? "Analyzing… Backend may be waking up (cold start); this can take up to a minute."
            : "Analyze"}
        </button>

            {error && <p className="error">{error}</p>}
          </section>

          {result && (
        <section className="results">
          <h2 className="sectionTitle">Extracted data</h2>
          <pre className="block">
            {JSON.stringify(result.invoiceData, null, 2)}
          </pre>

          <h2 className="sectionTitle">Issues</h2>
          <div className="block issues">
            {result.issues.length === 0 ? (
              <p className="muted">None — all checks passed.</p>
            ) : (
              result.issues.map((i, idx) => (
                <div key={idx} className="issue">
                  <span className="issueRule">{i.rule}</span>
                  <span className="issueMessage">{i.message}</span>
                </div>
              ))
            )}
          </div>

          <h2 className="sectionTitle">Risk</h2>
          <p className="risk">
            <span
              className={`riskBadge ${
                ["LOW", "MEDIUM", "HIGH"].includes(result.risk)
                  ? `risk${result.risk}`
                  : ""
              }`}
            >
              {result.risk}
            </span>
          </p>

          <h2 className="sectionTitle">Explanation</h2>
          <div className="block explanation">{result.explanation}</div>
          </section>
          )}
        </>
      )}
    </main>
  );
}
