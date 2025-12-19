/* Ticket Analyzer — GitHub Pages friendly
   - AI mode uses OpenAI Responses API: POST https://api.openai.com/v1/responses
   - Fallback mode uses simple heuristics (no API required)
*/

const $ = (id) => document.getElementById(id);

const els = {
  ticket: $("ticket"),
  analyzeBtn: $("analyzeBtn"),
  clearBtn: $("clearBtn"),
  status: $("status"),

  severity: $("severity"),
  urgency: $("urgency"),
  emoji: $("emoji"),
  reply: $("reply"),
  notes: $("notes"),

  meterBar: $("meterBar"),
  meterLabel: $("meterLabel"),

  apiKey: $("apiKey"),
  saveKeyBtn: $("saveKeyBtn"),
  useAi: $("useAi"),
  model: $("model"),
};

const LS_KEY = "ticket_analyzer_openai_key";
const LS_USE_AI = "ticket_analyzer_use_ai";
const LS_MODEL = "ticket_analyzer_model";

function setStatus(msg) { els.status.textContent = msg || ""; }

function setResult(r) {
  els.severity.textContent = r.severity ?? "—";
  els.urgency.textContent = r.urgency ?? "—";
  els.emoji.textContent = r.emoji ?? "—";
  els.reply.textContent = r.first_reply ?? "—";
  els.notes.textContent = r.notes ?? "—";

  const panic = clamp(Number(r.panic ?? 0), 0, 100);
  els.meterBar.style.width = `${panic}%`;
  els.meterLabel.textContent = `${panic} / 100`;
  // Update aria
  const meter = document.querySelector(".meter");
  meter?.setAttribute("aria-valuenow", String(panic));
}

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function loadSettings() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) els.apiKey.value = saved;

  const useAi = localStorage.getItem(LS_USE_AI);
  els.useAi.checked = useAi === "true";

  const model = localStorage.getItem(LS_MODEL);
  if (model) els.model.value = model;
}
loadSettings();

els.saveKeyBtn.addEventListener("click", () => {
  localStorage.setItem(LS_KEY, els.apiKey.value.trim());
  localStorage.setItem(LS_USE_AI, String(els.useAi.checked));
  localStorage.setItem(LS_MODEL, els.model.value);
  setStatus("Saved locally in this browser.");
  setTimeout(() => setStatus(""), 1200);
});

els.clearBtn.addEventListener("click", () => {
  els.ticket.value = "";
  setResult({ severity:"—", urgency:"—", emoji:"—", first_reply:"—", notes:"—", panic:0 });
  setStatus("");
});

els.analyzeBtn.addEventListener("click", async () => {
  const text = (els.ticket.value || "").trim();
  if (!text) {
    setStatus("Paste a ticket description first.");
    return;
  }

  els.analyzeBtn.disabled = true;
  setStatus("Analyzing…");

  try {
    const useAi = els.useAi.checked;
    localStorage.setItem(LS_USE_AI, String(useAi));
    localStorage.setItem(LS_MODEL, els.model.value);

    let result;
    if (useAi) {
      const apiKey = (els.apiKey.value || localStorage.getItem(LS_KEY) || "").trim();
      if (!apiKey) throw new Error("No API key set. Disable AI mode or paste your key in AI Mode.");
      result = await analyzeWithOpenAI(text, apiKey, els.model.value);
    } else {
      result = analyzeHeuristic(text);
    }

    setResult(result);
    setStatus(useAi ? "Done (AI mode)." : "Done (heuristic mode).");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message || err}`);
  } finally {
    els.analyzeBtn.disabled = false;
  }
});

function analyzeHeuristic(text){
  const t = text.toLowerCase();

  const flags = {
    outage: /(down|outage|unavailable|cannot access|can't access|500|503|crash|broken|fatal)/.test(t),
    payments: /(payment|checkout|billing|stripe|paypal|invoice)/.test(t),
    security: /(security|breach|leak|token|credential|hacked|vulnerability|cve)/.test(t),
    vip: /(ceo|vp|director|executive|important client|enterprise)/.test(t),
    manyUsers: /(all users|everyone|company-wide|entire site|global)/.test(t),
    dataLoss: /(data loss|deleted|missing data|corrupt)/.test(t),
    angry: /(angry|furious|refund|lawsuit|cancel|churn)/.test(t),
    urgentWords: /(urgent|asap|immediately|now|critical|p1|sev1)/.test(t),
    time: /(\d{1,2}:\d{2}|\bminutes\b|\bhours\b|\bdays\b)/.test(t),
  };

  let score = 10;
  if (flags.outage) score += 30;
  if (flags.manyUsers) score += 20;
  if (flags.security) score += 35;
  if (flags.dataLoss) score += 25;
  if (flags.payments) score += 15;
  if (flags.vip) score += 10;
  if (flags.angry) score += 10;
  if (flags.urgentWords) score += 10;

  score = clamp(score, 0, 100);

  const severity =
    score >= 85 ? "🔥 On Fire" :
    score >= 60 ? "High" :
    score >= 35 ? "Medium" : "Low";

  const urgencyMins =
    score >= 85 ? 15 :
    score >= 60 ? 60 :
    score >= 35 ? 240 : 1440;

  const urgency = urgencyMins < 60
    ? `Respond within ${urgencyMins} minutes`
    : urgencyMins < 1440
      ? `Respond within ${Math.round(urgencyMins/60)} hours`
      : "Respond within 1 business day";

  const emoji =
    flags.security ? "🛡️" :
    flags.outage ? "🚨" :
    flags.payments ? "💳" :
    score >= 60 ? "😬" :
    score >= 35 ? "🧯" : "✅";

  const first_reply = buildFirstReply({ severity, flags });
  const notes = [
    `Signals: ${Object.entries(flags).filter(([,v])=>v).map(([k])=>k).join(", ") || "none"}`,
    "Tip: enable AI mode for richer classification + better wording."
  ].join("\n");

  return {
    severity,
    urgency,
    emoji,
    first_reply,
    notes,
    panic: score
  };
}

function buildFirstReply({ severity, flags }) {
  const opener =
    severity === "🔥 On Fire" ? "Thanks for flagging this — we’re treating it as top priority." :
    severity === "High" ? "Thanks — we’re on it and investigating now." :
    severity === "Medium" ? "Thanks — we’ve received this and are looking into it." :
    "Thanks — we’ve received your request.";

  const ask =
    flags.security ? "Can you share any relevant logs, timestamps, and whether credentials may be exposed?" :
    flags.outage ? "Can you confirm scope (who is impacted) and provide timestamps / error messages?" :
    flags.payments ? "Can you share order IDs, timestamps, and any payment provider error details?" :
    "Can you share steps to reproduce and expected vs actual behavior?";

  const eta =
    severity === "🔥 On Fire" ? "Next update in ~30 minutes (or sooner if we identify the cause)." :
    severity === "High" ? "Next update in ~2 hours." :
    severity === "Medium" ? "Next update by end of day." :
    "We’ll follow up once we’ve investigated.";

  return `${opener}\n\n${ask}\n\n${eta}`;
}

async function analyzeWithOpenAI(ticketText, apiKey, model) {
  // Uses Responses API (recommended) :contentReference[oaicite:2]{index=2}
  const system = `You are a senior support triage assistant. Classify incoming support tickets with calm, practical judgment.
Return ONLY valid JSON matching the schema. No markdown. No extra keys.`;

  const schema = {
    name: "ticket_triage",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        severity: { type: "string", enum: ["Low", "Medium", "High", "🔥 On Fire"] },
        urgency_minutes: { type: "integer", minimum: 5, maximum: 10080 },
        emoji: { type: "string" },
        first_reply: { type: "string" },
        notes: { type: "string" },
        panic: { type: "integer", minimum: 0, maximum: 100 }
      },
      required: ["severity","urgency_minutes","emoji","first_reply","notes","panic"]
    }
  };

  const body = {
    model,
    input: [
      { role: "system", content: system },
      {
        role: "user",
        content:
`Ticket:
${ticketText}

Rules:
- Severity is about impact + risk (security/data loss/outage/VIP).
- urgency_minutes is the time until first meaningful response is needed.
- first_reply must be short, professional, and include 1-2 targeted questions + a realistic next update time.
- emoji should match the situation (one emoji).
- panic is 0..100.`
      }
    ],
    response_format: { type: "json_schema", json_schema: schema }
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI error (${resp.status}): ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();

  // The Responses API returns output items; easiest is to read "output_text" if present,
  // but with structured outputs we can parse JSON from the text output safely.
  const text = extractOutputText(data);
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    // Fallback: try to locate JSON substring
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse JSON from model output.");
    obj = JSON.parse(match[0]);
  }

  const urgency = formatUrgency(obj.urgency_minutes);
  return {
    severity: obj.severity,
    urgency,
    emoji: obj.emoji,
    first_reply: obj.first_reply,
    notes: obj.notes,
    panic: obj.panic
  };
}

function extractOutputText(data) {
  // Many responses include an "output_text" convenience field; if absent, stitch text parts.
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

  const parts = [];
  for (const item of (data.output || [])) {
    for (const c of (item.content || [])) {
      if (c.type === "output_text" && c.text) parts.push(c.text);
      if (c.type === "text" && c.text) parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

function formatUrgency(minutes) {
  const m = clamp(Number(minutes || 0), 5, 10080);
  if (m < 60) return `Respond within ${m} minutes`;
  const hours = Math.round(m / 60);
  if (hours < 24) return `Respond within ${hours} hours`;
  const days = Math.round(hours / 24);
  return `Respond within ${days} day(s)`;
}
