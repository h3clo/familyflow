import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const ALLOWED = new Set(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function sanitize(raw: unknown) {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  return {
    household: String(c.household || "우리 집").slice(0, 80),
    shoppingOpen: Array.isArray(c.shoppingOpen)
      ? c.shoppingOpen.slice(0, 40).map((i: any) => ({
        name: String(i?.name || "").slice(0, 80),
        quantity: Number(i?.quantity) || 1,
        unit: String(i?.unit || "개").slice(0, 20),
        priority: i?.priority === "nice" ? "nice" : "must",
      }))
      : [],
    inventory: Array.isArray(c.inventory)
      ? c.inventory.slice(0, 60).map((i: any) => ({
        name: String(i?.name || "").slice(0, 80),
        status: String(i?.status || "").slice(0, 20),
        location: String(i?.location || "").slice(0, 20),
        category: String(i?.category || "other").slice(0, 20),
      }))
      : [],
    todayDinner: c.todayDinner
      ? {
        title: String(c.todayDinner.title || "").slice(0, 80),
        protein: String(c.todayDinner.protein || "").slice(0, 40),
      }
      : null,
    weekDinnerProteins: Array.isArray(c.weekDinnerProteins)
      ? c.weekDinnerProteins.slice(0, 14).map((p: any) => ({
        date: String(p?.date || "").slice(0, 16),
        protein: String(p?.protein || "").slice(0, 40),
        title: String(p?.title || "").slice(0, 80),
      }))
      : [],
    mealPlanStatus: c.mealPlanStatus ? String(c.mealPlanStatus).slice(0, 20) : null,
    patterns: Array.isArray(c.patterns)
      ? c.patterns.slice(0, 12).map((p: any) => ({
        name: String(p?.name || "").slice(0, 40),
        method: String(p?.method || "").slice(0, 20),
        effort: String(p?.effort || "").slice(0, 20),
      }))
      : [],
  };
}

function systemPrompt(context: unknown) {
  return `당신은 Family Flow 가정 생활 비서입니다. 한국어로 짧고 솔직하게 답합니다.
절대 규칙:
1) DB를 직접 수정하지 마세요. 변경은 JSON proposal만.
2) op: shopping.add, shopping.remove_unchecked, inventory.set_status, inventory.upsert, meals.confirm_dinner, meals.draft_week, meals.confirm_week, meals.replace_protein
3) 부족하면 kind=clarify. 대화만 kind=chat.
4) 건강·금융·비밀번호·연락처 금지.
5) JSON만 출력.
형식: {"kind":"chat"|"clarify"|"proposal","message":"...","title":"...","reason":"...","ops":[{"op":"...","payload":{}}]}
데이터: ${JSON.stringify(context)}`;
}

function parseReset(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d+(\.\d+)?s$/i.test(s)) return Math.ceil(parseFloat(s));
  if (/^\d+(\.\d+)?m/.test(s)) {
    const m = parseFloat(s);
    const sec = s.match(/([\d.]+)s/i);
    return Math.ceil(m * 60 + (sec ? parseFloat(sec[1]) : 0));
  }
  if (/^\d+(\.\d+)?h/.test(s)) return Math.ceil(parseFloat(s) * 3600);
  const n = Number(s);
  return Number.isFinite(n) ? Math.ceil(n) : null;
}

function classify429(headers: Headers, retryAfterSec: number | null) {
  const remaining = headers.get("x-ratelimit-remaining-requests");
  const resetReq = parseReset(headers.get("x-ratelimit-reset-requests") || "");
  const resetTok = parseReset(headers.get("x-ratelimit-reset-tokens") || "");
  if (remaining === "0" && (resetReq == null || resetReq > 120)) return { kind: "rpd", retryAfterSec: resetReq };
  if (resetReq != null && resetReq > 120 && (retryAfterSec == null || retryAfterSec > 60)) {
    return { kind: "rpd", retryAfterSec: resetReq };
  }
  return { kind: "rpm", retryAfterSec: retryAfterSec ?? resetTok ?? resetReq ?? 2 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "unauthorized", message: "로그인이 필요해요." });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const householdId = String(body.householdId || "").trim();
  const userText = String(body.userText || "").trim().slice(0, 500);
  if (!householdId || !userText) {
    return json(400, { error: "bad_request", message: "householdId와 userText가 필요해요." });
  }
  const model = ALLOWED.has(String(body.model || "")) ? String(body.model) : DEFAULT_MODEL;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json(401, { error: "unauthorized", message: "세션이 유효하지 않아요." });
  }

  const { data: quota, error: qErr } = await supabase.rpc("claim_ai_quota", {
    p_household_id: householdId,
    p_provider: "groq",
    p_model: model,
    p_rpm: 20,
    p_rpd: 200,
  });
  if (qErr) {
    const msg = qErr.message || "quota_error";
    if (/not allowed|42501/i.test(msg)) {
      return json(403, { error: "forbidden", message: "이 집 AI를 쓸 권한이 없어요." });
    }
    return json(400, { error: "quota_error", message: msg });
  }
  if (quota && quota.ok === false) {
    return json(429, {
      error: "app_quota",
      limitKind: quota.reason === "rpd" ? "rpd" : "rpm",
      message: quota.reason === "rpd"
        ? "오늘 가족 AI 호출 한도에 도달했어요. 규칙 비서로 계속할 수 있어요."
        : "잠시 호출이 많아요. 잠시 후 다시 시도하거나 규칙 비서를 쓰세요.",
      retryAfterSec: quota.retryAfterSec ?? null,
      fallback: "rules",
      paidUpgrade: false,
    });
  }

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) {
    return json(503, {
      error: "groq_not_configured",
      message: "GROQ_API_KEY 시크릿이 아직 없습니다. 대시보드 Secrets에만 등록하세요.",
      fallback: "rules",
      paidUpgrade: false,
    });
  }

  const context = sanitize(body.context);
  const callGroq = () =>
    fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 768,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(context) },
          { role: "user", content: userText },
        ],
      }),
    });

  let groqRes = await callGroq();
  if (groqRes.status === 429) {
    const ra = Number(groqRes.headers.get("retry-after") || "");
    const classified = classify429(groqRes.headers, Number.isFinite(ra) ? ra : null);
    if (classified.kind === "rpm") {
      await new Promise((r) => setTimeout(r, Math.min(8000, Math.max(500, (classified.retryAfterSec || 2) * 1000))));
      groqRes = await callGroq();
    }
    if (groqRes.status === 429) {
      const again = classify429(groqRes.headers, Number(groqRes.headers.get("retry-after") || classified.retryAfterSec || 0) || null);
      return json(429, {
        error: "groq_rate_limit",
        limitKind: again.kind,
        message: again.kind === "rpd"
          ? "Groq 일일 무료 한도에 도달했어요. 규칙 비서로 전환합니다. (유료 전환 없음)"
          : "Groq 분당 한도예요. 잠시 후 다시 시도하거나 규칙 비서를 쓰세요.",
        retryAfterSec: again.retryAfterSec,
        fallback: "rules",
        paidUpgrade: false,
        provider: "groq",
        model,
      });
    }
  }

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    return json(502, {
      error: "groq_upstream",
      message: `Groq 요청 실패 (HTTP ${groqRes.status})`,
      detail: errText.slice(0, 200),
      fallback: "rules",
      paidUpgrade: false,
    });
  }

  const data = await groqRes.json();
  return json(200, {
    ok: true,
    provider: "groq",
    model,
    text: data?.choices?.[0]?.message?.content || "",
    usage: data?.usage || null,
    paidUpgrade: false,
  });
});
