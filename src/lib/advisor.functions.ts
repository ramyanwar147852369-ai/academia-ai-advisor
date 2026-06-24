import { createServerFn } from "@tanstack/react-start";
import { GRADE_CONFIG, STATUS_CONFIG } from "./transcript-config";

// ---- Gemini API helper ---------------------------------------------------

// Gemini's function-declaration schema is an OpenAPI 3.0 subset and does NOT
// accept JSON-Schema type arrays like ["string", "null"]. Convert those into
// a single type with `nullable: true`, recursively.
function sanitizeSchema(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sanitizeSchema);
  if (!input || typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k === "additionalProperties") continue;
    if (k === "type" && Array.isArray(v)) {
      const types = v.filter((t) => t !== "null");
      out.type = types[0];
      if (v.includes("null")) out.nullable = true;
    } else {
      out[k] = sanitizeSchema(v);
    }
  }
  return out;
}

type GeminiToolCallArgs = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userParts: Array<Record<string, unknown>>;
  functionDeclarations: Array<{
    name: string;
    description?: string;
    parameters: unknown;
  }>;
  toolName: string;
  temperature?: number;
};

async function callGeminiTool<T>(args: GeminiToolCallArgs): Promise<T> {
  return geminiReliability.run<T>(args, doCallGeminiTool);
}

async function doCallGeminiTool<T>(args: GeminiToolCallArgs): Promise<T> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${encodeURIComponent(args.apiKey)}`;
  const body = {
    systemInstruction: { role: "system", parts: [{ text: args.systemPrompt }] },
    contents: [{ role: "user", parts: args.userParts }],
    tools: [
      {
        functionDeclarations: args.functionDeclarations.map((fd) => ({
          name: fd.name,
          description: fd.description,
          parameters: sanitizeSchema(fd.parameters),
        })),
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [args.toolName],
      },
    },
    generationConfig: {
      temperature: args.temperature ?? 0.2,
    },
  };

  const resp = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await resp.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          functionCall?: { name: string; args: unknown };
          text?: string;
        }>;
      };
    }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const fc = parts.find((p) => p.functionCall)?.functionCall;
  if (fc?.args) return fc.args as T;
  // Fallback: some Gemini responses return JSON text instead of a functionCall.
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (text) {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // fallthrough
    }
  }
  throw new Error("Gemini did not return a structured tool call.");
}

// ---- Reliability layer (retry + backoff + concurrency + dedup) ------------
// Surgical wrapper around callGeminiTool. Does NOT change request shape,
// prompts, models, or business logic — only adds resilience around the
// network call so transient 429/5xx no longer fail the whole analysis.

const RETRY_MAX_ATTEMPTS = 3; // total attempts including the first try
const RETRY_BASE_MS = 800;
const RETRY_MAX_BACKOFF_MS = 8000;
const DEDUP_TTL_MS = 15_000;
const MAX_CONCURRENT = 2;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function parseRetryAfter(headerVal: string | null): number | null {
  if (!headerVal) return null;
  const asNum = Number(headerVal);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.min(asNum * 1000, RETRY_MAX_BACKOFF_MS);
  const asDate = Date.parse(headerVal);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0) return Math.min(delta, RETRY_MAX_BACKOFF_MS);
  }
  return null;
}

function friendlyError(status: number): Error {
  if (status === 429)
    return new Error("Service is busy right now. Please try again in a moment.");
  if (status === 401 || status === 403)
    return new Error("AI service authentication failed. Please contact support.");
  if (status >= 500)
    return new Error("AI service is temporarily unavailable. Please try again shortly.");
  return new Error("AI service request failed. Please try again.");
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastStatus = 0;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, init);
      if (resp.ok) return resp;
      lastStatus = resp.status;
      // Non-retryable client errors (auth, bad request): fail fast
      if (resp.status !== 429 && resp.status < 500) {
        const errTxt = await resp.text().catch(() => "");
        console.error("Gemini API error:", resp.status, errTxt);
        throw friendlyError(resp.status);
      }
      const errTxt = await resp.text().catch(() => "");
      console.warn(
        `Gemini API transient error ${resp.status} (attempt ${attempt}/${RETRY_MAX_ATTEMPTS}):`,
        errTxt.slice(0, 200),
      );
      if (attempt === RETRY_MAX_ATTEMPTS) break;
      const retryAfter = parseRetryAfter(resp.headers.get("retry-after"));
      const backoff =
        retryAfter ??
        Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * 300);
      await sleep(backoff + jitter);
    } catch (err) {
      // Network / fetch failure — retry a couple of times
      lastErr = err;
      if (err instanceof Error && /AI service /.test(err.message)) throw err;
      console.warn(
        `Gemini fetch failed (attempt ${attempt}/${RETRY_MAX_ATTEMPTS}):`,
        err,
      );
      if (attempt === RETRY_MAX_ATTEMPTS) break;
      const backoff = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_BACKOFF_MS);
      await sleep(backoff + Math.floor(Math.random() * 300));
    }
  }
  if (lastStatus) throw friendlyError(lastStatus);
  throw lastErr instanceof Error
    ? new Error("AI service is temporarily unavailable. Please try again shortly.")
    : new Error("AI service request failed. Please try again.");
}

// Stable hash for dedup cache key — small/fast, no crypto needed.
function hashKey(s: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function keyOf(args: GeminiToolCallArgs): string {
  // Exclude apiKey from cache key; include everything that shapes the request.
  const payload = JSON.stringify({
    m: args.model,
    s: args.systemPrompt,
    u: args.userParts,
    f: args.functionDeclarations,
    t: args.toolName,
    temp: args.temperature ?? 0.2,
  });
  return hashKey(payload);
}

type InflightEntry = { promise: Promise<unknown>; at: number };

class GeminiReliability {
  private inflight = new Map<string, InflightEntry>();
  private active = 0;
  private queue: Array<() => void> = [];

  private async acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  async run<T>(
    args: GeminiToolCallArgs,
    worker: (args: GeminiToolCallArgs) => Promise<T>,
  ): Promise<T> {
    const key = keyOf(args);
    const now = Date.now();
    const existing = this.inflight.get(key);
    if (existing && now - existing.at < DEDUP_TTL_MS) {
      return existing.promise as Promise<T>;
    }
    const promise = (async () => {
      await this.acquire();
      try {
        return await worker(args);
      } finally {
        this.release();
      }
    })();
    // Keep successful results cached briefly for dedup; evict failures
    // immediately so the user can retry without hitting a stale error.
    promise.then(
      () => {
        setTimeout(() => {
          const cur = this.inflight.get(key);
          if (cur && cur.promise === promise) this.inflight.delete(key);
        }, DEDUP_TTL_MS);
      },
      () => {
        const cur = this.inflight.get(key);
        if (cur && cur.promise === promise) this.inflight.delete(key);
      },
    );
    this.inflight.set(key, { promise, at: now });
    return promise;
  }
}

const geminiReliability = new GeminiReliability();

// --------------------------------------------------------------------------

// --------------------------------------------------------------------------

export type Course = {
  code: string;
  name: string;
  credits: number;
  grade: string;
  gradePoints: number | null;
  passed: boolean;
};

export type Semester = {
  label: string; // e.g. "Fall 2023"
  termType: "fall" | "spring" | "summer" | "winter" | "other";
  gpa: number | null;
  cgpa: number | null;
  credits: number;
  courses: Course[];
  status?: string; // "Enrolled", "Withdrawn", etc. Only "Enrolled" counts toward warnings.
  // computed below in server:
  warningCount?: number;
  isWarningSemester?: boolean;
  resetThisSemester?: boolean;
  countedAsSummer?: boolean; // true for actual summer or Spring 2020 special-case
};

export type RiskLevel = "safe" | "warning" | "high_risk" | "dismissal_risk";

export type AdvisorReport = {
  institution: string;
  studentName: string | null;
  program: string | null;
  currentGPA: number | null;
  cgpa: number | null;
  totalCredits: number | null;
  semesters: Semester[];
  failedCourses: Course[];
  warningSemesterCount: number;
  remainingSemesters: number; // 6 - warningSemesterCount (min 0)
  riskLevel: RiskLevel;
  riskScore: number; // 0-100
  withdrawalRecommended: boolean;
  predictedNextSemesterDismissal: boolean;
  suggestedCreditLoad: number;
  recommendations: string[];
  warnings: string[];
  summary: string;
  // Section 2 (AI layer) status. Section 1 (deterministic) is always populated.
  aiNarrativeAvailable: boolean;
  aiNarrativeError?: string | null;
};

type Input = {
  institution: string;
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  text?: string;
  lang?: "en" | "ar";
};

type AIRaw = Omit<
  AdvisorReport,
  | "warningSemesterCount"
  | "riskLevel"
  | "riskScore"
  | "withdrawalRecommended"
  | "predictedNextSemesterDismissal"
  | "institution"
  | "remainingSemesters"
  | "suggestedCreditLoad"
  | "aiNarrativeAvailable"
  | "aiNarrativeError"
> & {
  semesters: Omit<Semester, "warningCount" | "isWarningSemester" | "resetThisSemester">[];
};

function applyAcademicRules(
  raw: AIRaw,
  institution: string,
): AdvisorReport {
  // Convert various GPA inputs (number, string with decimal/comma, Arabic numerals) → number|null
  function parseGpa(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    // Arabic-Indic + Extended Arabic-Indic digits → ASCII
    let s = v.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
             .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
             .replace(/,/g, ".")
             .trim();
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  // Sort semesters by academic year, then Fall → Spring → Summer → Winter
  // within that year. An academic year "YYYY/ZZZZ" runs Fall YYYY → Spring ZZZZ → Summer ZZZZ.
  // Labels may be "Fall 2023", "Fall 2023/2024", "خريف 2023/2024", etc.
  function semOrder(s: { label?: string; termType?: string }): number {
    const label = s.label ?? "";
    const norm = label
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
    const years = norm.match(/\d{4}/g) ?? [];
    const lower = norm.toLowerCase();
    const termRank: Record<string, number> = { fall: 0, spring: 1, summer: 2, winter: 3, other: 4 };
    const t = s.termType ?? "other";
    const isFall = t === "fall" || lower.includes("fall") || label.includes("خريف");
    const isSpring = t === "spring" || lower.includes("spring") || label.includes("ربيع");
    const isSummer = t === "summer" || lower.includes("summer") || label.includes("صيف");
    const isWinter = t === "winter" || lower.includes("winter") || label.includes("شتاء");

    let startYear = 0;
    if (years.length >= 2) {
      // Academic-year notation "YYYY/ZZZZ" — start year is the first one
      startYear = parseInt(years[0]!, 10);
    } else if (years.length === 1) {
      const y = parseInt(years[0]!, 10);
      // Fall YYYY → academic year YYYY/(YYYY+1); Spring/Summer/Winter YYYY → (YYYY-1)/YYYY
      startYear = isFall ? y : isSpring || isSummer || isWinter ? y - 1 : y;
    }
    return startYear * 10 + (termRank[t] ?? 4);
  }
  const sems = raw.semesters.slice().sort((a, b) => semOrder(a) - semOrder(b));

  // Normalize each course's `passed` from its grade — the AI sometimes mis-labels
  // passed/failed especially on Arabic transcripts. Grade-based detection is the
  // source of truth. Use the shared GRADE_CONFIG for consistency.
  for (const sem of sems) {
    for (const c of sem.courses) {
      const inferred = GRADE_CONFIG.isPassingGrade(c.grade);
      if (inferred !== null) c.passed = inferred;
    }
  }

  // Normalize semester enrollment status across English and Arabic transcripts.
  // Only "Enrolled" / "مقيد" (and close synonyms) count as enrolled. Anything else
  // — Withdrawn, Deferred, Postponed, Dismissed, "غير مقيد", "منسحب", "مؤجل",
  // "موقوف", "مفصول", etc. — resets the warning streak, matching the English rule.
  function isEnrolledStatus(status: string | undefined | null): boolean {
    return STATUS_CONFIG.isEnrolledStatus(status);
  }

  let warningCount = 0;
  let lastKnownCgpa: number | null = null;
  const enriched: Semester[] = sems.map((s) => {
    const gpa = parseGpa(s.gpa);
    const cgpa = parseGpa(s.cgpa);
    if (cgpa !== null) lastKnownCgpa = cgpa;
    const effectiveCgpa = cgpa ?? lastKnownCgpa;
    const labelLower = (s.label ?? "").toLowerCase();
    // Spring 2019/2020 (Covid term) — accept either "2019" or "2020" in the label
    const isSpring1920 =
      (labelLower.includes("spring") || (s.label ?? "").includes("ربيع")) &&
      (labelLower.includes("2019") && labelLower.includes("2020"));
    const countedAsSummer = s.termType === "summer" || isSpring1920;
    const statusEnrolled = isEnrolledStatus(s.status);
    let isWarning = false;
    let reset = false;

    // Exempt from warning if EITHER semester GPA OR (current/last-known) CGPA ≥ 2.0
    const gpaOk = gpa !== null && gpa >= 2;
    const cgpaOk = effectiveCgpa !== null && effectiveCgpa >= 2;
    const isExemptFromWarning = gpaOk || cgpaOk;
    const hasAnyIndicator = gpa !== null || effectiveCgpa !== null;
    const anyBelow =
      (gpa !== null && gpa < 2) || (effectiveCgpa !== null && effectiveCgpa < 2);

    if (!statusEnrolled) {
      if (warningCount > 0) reset = true;
      warningCount = 0;
    } else if (countedAsSummer) {
      if (isExemptFromWarning) {
        if (warningCount > 0) reset = true;
        warningCount = 0;
      }
    } else {
      if (isExemptFromWarning) {
        if (warningCount > 0) reset = true;
        warningCount = 0;
      } else if (hasAnyIndicator && anyBelow) {
        warningCount += 1;
        isWarning = true;
      }
    }
    return {
      ...s,
      gpa,
      cgpa,
      status: s.status ?? "Enrolled",
      warningCount,
      isWarningSemester: isWarning,
      resetThisSemester: reset,
      countedAsSummer,
    };
  });

  // Find the latest semester with valid GPA/CGPA values (not just the last semester)
  let latestCgpa = null;
  let latestGpa = null;
  for (let i = enriched.length - 1; i >= 0; i--) {
    if (latestCgpa === null && enriched[i].cgpa !== null) {
      latestCgpa = enriched[i].cgpa;
    }
    if (latestGpa === null && enriched[i].gpa !== null) {
      latestGpa = enriched[i].gpa;
    }
    if (latestCgpa !== null && latestGpa !== null) break;
  }
  const lastCgpa = parseGpa(raw.cgpa) ?? latestCgpa ?? null;
  const lastGpa = parseGpa(raw.currentGPA) ?? latestGpa ?? null;

  // Filter failed courses: only keep those NOT later retaken & passed.
  // Build deterministically from chronologically-sorted semester courses ONLY.
  // The AI-supplied `failedCourses` list is ignored — only the LATEST attempt
  // of each course matters. If the latest attempt passed, the course is not failed.
  // Normalize course code (strip ALL whitespace, uppercase) so "CIS 113" === "CIS113".
  // Normalize course code: convert Arabic-Indic digits to ASCII, strip any
  // non-alphanumeric character (spaces, dashes, dots, NBSP, zero-width chars),
  // and uppercase. This ensures "BAS 012", "BAS-012", "BAS012", and the
  // Arabic-digit variant all collapse to the same key so a later passing
  // attempt correctly supersedes the earlier failure.
  const normCode = (c: string) =>
    (c ?? "")
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      // Normalize Arabic letters to their closest Latin equivalents for course code matching
      // ا/أ/إ/آ → A, ب → B, پ → P, ت → T, ث → Th, ج → J, چ → Ch, ح → H, خ → Kh
      // د → D, ذ → Dh, ر → R, ز → Z, س → S, ش → Sh, ص → S, ض → D, ط → T, ظ → Z
      // ع → A, غ → Gh, ف → F, ق → Q, ك → K, ل → L, م → M, ن → N, ه → H, و → W, ي → Y
      .replace(/[\u0627\u0623\u0625\u0622]/g, "A")
      .replace(/[\u0628]/g, "B")
      .replace(/[\u067E]/g, "P")
      .replace(/[\u062A]/g, "T")
      .replace(/[\u062B]/g, "Th")
      .replace(/[\u062C]/g, "J")
      .replace(/[\u0686]/g, "Ch")
      .replace(/[\u062D]/g, "H")
      .replace(/[\u062E]/g, "Kh")
      .replace(/[\u062F]/g, "D")
      .replace(/[\u0630]/g, "Dh")
      .replace(/[\u0631]/g, "R")
      .replace(/[\u0632]/g, "Z")
      .replace(/[\u0633]/g, "S")
      .replace(/[\u0634]/g, "Sh")
      .replace(/[\u0635]/g, "S")
      .replace(/[\u0636]/g, "D")
      .replace(/[\u0637]/g, "T")
      .replace(/[\u0638]/g, "Z")
      .replace(/[\u0639]/g, "A")
      .replace(/[\u063A]/g, "Gh")
      .replace(/[\u0641]/g, "F")
      .replace(/[\u0642]/g, "Q")
      .replace(/[\u0643]/g, "K")
      .replace(/[\u0644]/g, "L")
      .replace(/[\u0645]/g, "M")
      .replace(/[\u0646]/g, "N")
      .replace(/[\u0647]/g, "H")
      .replace(/[\u0648]/g, "W")
      .replace(/[\u0649\u064A]/g, "Y")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
  const latestAttempt = new Map<string, Course>();
  const everPassed = new Set<string>();
  for (const sem of enriched) {
    for (const c of sem.courses) {
      const key = normCode(c.code);
      if (!key) continue;
      latestAttempt.set(key, c); // overwrite; iteration is chronological
      if (c.passed) everPassed.add(key);
    }
  }
  // A course is "outstanding failed" ONLY if its latest attempt failed AND
  // it was never passed in any other attempt. This is defensive against
  // out-of-order semester sorting on transcripts with ambiguous labels.
  const filteredFailed = Array.from(latestAttempt.values())
    .filter((c) => !c.passed && !everPassed.has(normCode(c.code)))
    .sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  // Risk level
  let riskLevel: RiskLevel = "safe";
  if (warningCount >= 6) {
    riskLevel = "dismissal_risk";
  } else if (warningCount >= 5) {
    riskLevel = "dismissal_risk";
  } else if (warningCount >= 3) {
    riskLevel = "high_risk";
  } else if (warningCount >= 1) {
    riskLevel = "warning";
  }

  // Risk score
  // Risk score primarily based on warning streak (out of 6 allowed).
  let riskScore = Math.min(warningCount, 6) * 15; // up to 90
  if (lastCgpa !== null && lastCgpa < 2) riskScore += 8;
  if (lastGpa !== null && lastGpa < 2) riskScore += 4;
  riskScore = Math.max(0, Math.min(100, riskScore));

  // Recommend NOT registering next semester once student already has 5 warnings.
  const withdrawalRecommended = warningCount >= 5;
  const predictedNextSemesterDismissal = warningCount >= 5;
  const remainingSemesters = Math.max(0, 6 - warningCount);

  // Credit load suggestion
  let suggestedCreditLoad = 15;
  if (riskLevel === "dismissal_risk") suggestedCreditLoad = 9;
  else if (riskLevel === "high_risk") suggestedCreditLoad = 12;
  else if (riskLevel === "warning") suggestedCreditLoad = 13;

  return {
    institution,
    studentName: raw.studentName ?? null,
    program: raw.program ?? null,
    currentGPA: lastGpa,
    cgpa: lastCgpa,
    totalCredits: raw.totalCredits ?? null,
    semesters: enriched,
    failedCourses: filteredFailed,
    warningSemesterCount: warningCount,
    remainingSemesters,
    riskLevel,
    riskScore,
    withdrawalRecommended,
    predictedNextSemesterDismissal,
    suggestedCreditLoad,
    recommendations: [],
    warnings: [],
    summary: "",
    aiNarrativeAvailable: false,
    aiNarrativeError: null,
  };
}

// ---------- Section 1: Deterministic narrative (no AI required) ----------
// Produces summary, warnings, and recommendations purely from the structured
// report. Used as the baseline so the UI is fully populated even if the AI
// recommendation layer (Section 2) is unavailable.
function buildDeterministicNarrative(
  r: AdvisorReport,
  lang: "en" | "ar",
): { summary: string; warnings: string[]; recommendations: string[] } {
  const ar = lang === "ar";
  const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(2));
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // ---- Warnings (concrete, data-driven) ----
  if (r.warningSemesterCount > 0) {
    warnings.push(
      ar
        ? `لديك ${r.warningSemesterCount} من 6 فصول إنذار متراكمة.`
        : `You currently have ${r.warningSemesterCount} of 6 cumulative warning semesters.`,
    );
  }
  if (r.warningSemesterCount >= 5) {
    warnings.push(
      ar
        ? "أنت على بُعد فصل واحد من الفصل الأكاديمي."
        : "You are one semester away from academic dismissal.",
    );
  }
  if (r.cgpa !== null && r.cgpa < 2) {
    warnings.push(
      ar
        ? `المعدل التراكمي (${fmt(r.cgpa)}) أقل من 2.0.`
        : `Cumulative GPA (${fmt(r.cgpa)}) is below 2.0.`,
    );
  }
  if (r.currentGPA !== null && r.currentGPA < 2) {
    warnings.push(
      ar
        ? `معدل الفصل الأخير (${fmt(r.currentGPA)}) أقل من 2.0.`
        : `Latest semester GPA (${fmt(r.currentGPA)}) is below 2.0.`,
    );
  }
  if (r.failedCourses.length > 0) {
    const codes = r.failedCourses.map((c) => c.code).join(", ");
    warnings.push(
      ar
        ? `مقررات راسبة لم تُعَد بنجاح: ${codes}.`
        : `Outstanding failed courses not yet retaken: ${codes}.`,
    );
  }
  // GPA trend over last 3 enrolled regular semesters
  const isEnrolled = (status: string | undefined | null) => {
    if (status == null) return true;
    const raw = String(status).trim();
    if (raw === "") return true;
    if (/غير\s*(مقيد|منتظم|مسجل)/.test(raw)) return false;
    if (/(مقيد|مسجل|مُسجَّل|منتظم|مستمر)/.test(raw)) return true;
    if (/(منسحب|انسحاب|مؤجل|تأجيل|موقوف|إيقاف|مفصول|فصل|محروم)/.test(raw)) return false;
    return raw.toLowerCase() === "enrolled";
  };
  const enrolledRegular = r.semesters.filter(
    (s) => isEnrolled(s.status) && !s.countedAsSummer && s.gpa !== null,
  );
  const tail = enrolledRegular.slice(-3);
  if (tail.length === 3 && tail[0].gpa! > tail[1].gpa! && tail[1].gpa! > tail[2].gpa!) {
    warnings.push(
      ar
        ? "اتجاه نزولي مستمر في معدل الفصل خلال آخر ثلاثة فصول."
        : "Continuous downward GPA trend across the last three enrolled semesters.",
    );
  }

  // ---- Recommendations (action-oriented) ----
  if (r.withdrawalRecommended) {
    recommendations.push(
      ar
        ? "لا تسجّل في الفصل القادم؛ راجع المرشد الأكاديمي لتقييم خيارات تأجيل التسجيل."
        : "Do NOT register next semester; consult your academic advisor about deferring.",
    );
  } else {
    recommendations.push(
      ar
        ? `يمكن مواصلة التسجيل بحمل دراسي مقترح ${r.suggestedCreditLoad} ساعة معتمدة.`
        : `Continue registration with a suggested load of ${r.suggestedCreditLoad} credit hours.`,
    );
  }
  if (r.failedCourses.length > 0) {
    const codes = r.failedCourses
      .slice(0, 4)
      .map((c) => c.code)
      .join(", ");
    recommendations.push(
      ar
        ? `أعطِ الأولوية لإعادة المقررات الراسبة (${codes}) في أقرب فصل.`
        : `Prioritise retaking outstanding failed courses (${codes}) at the earliest opportunity.`,
    );
  }
  if (r.cgpa !== null && r.cgpa < 2) {
    recommendations.push(
      ar
        ? "ركّز على المقررات ذات الساعات الأكبر لرفع المعدل التراكمي فوق 2.0."
        : "Focus on higher-credit courses to lift cumulative GPA above 2.0.",
    );
  }
  if (r.warningSemesterCount >= 3) {
    recommendations.push(
      ar
        ? "احرص على لقاء أسبوعي مع المرشد الأكاديمي ومتابعة الأداء بانتظام."
        : "Schedule weekly check-ins with your academic advisor to track progress.",
    );
  }
  recommendations.push(
    ar
      ? "خصّص ساعات مذاكرة ثابتة يوميًا وراجع كل تقدير منخفض مع عضو هيئة التدريس."
      : "Build a consistent daily study schedule and review every low grade with the course instructor.",
  );

  // ---- Summary ----
  const standing = ar
    ? r.riskLevel === "safe"
      ? "وضع أكاديمي آمن"
      : r.riskLevel === "warning"
        ? "في حالة إنذار"
        : r.riskLevel === "high_risk"
          ? "في خطر مرتفع"
          : "في خطر الفصل الأكاديمي"
    : r.riskLevel === "safe"
      ? "in good academic standing"
      : r.riskLevel === "warning"
        ? "on academic warning"
        : r.riskLevel === "high_risk"
          ? "at high academic risk"
          : "at imminent risk of academic dismissal";
  const name = r.studentName ?? (ar ? "الطالب" : "The student");
  const summary = ar
    ? `${name} ${standing}. المعدل التراكمي ${fmt(r.cgpa)} ومعدل الفصل الأخير ${fmt(r.currentGPA)}. تم احتساب ${r.warningSemesterCount} من 6 فصول إنذار، ويتبقى ${r.remainingSemesters} فصلاً قبل بلوغ حد الفصل. عدد المقررات الراسبة التي لم تُعَد بنجاح: ${r.failedCourses.length}.`
    : `${name} is ${standing}. Cumulative GPA is ${fmt(r.cgpa)} and the latest semester GPA is ${fmt(r.currentGPA)}. ${r.warningSemesterCount} of 6 warning semesters have been counted, leaving ${r.remainingSemesters} before the dismissal threshold. Outstanding failed courses not yet retaken: ${r.failedCourses.length}.`;

  return { summary, warnings, recommendations };
}

export const analyzeTranscript = createServerFn({ method: "POST" })
  .inputValidator((data: Input) => {
    if (!data?.institution) throw new Error("Institution is required.");
    if (!data.text && !data.fileBase64) throw new Error("Provide transcript text or a file.");
    return data;
  })
  .handler(async ({ data }): Promise<AdvisorReport> => {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const lang = data.lang ?? "en";
    // Section 1 prompt: PURE EXTRACTION. The AI must NOT compute warnings,
    // risk, recommendations, or summary — those are produced deterministically
    // by the server. Keeping the prompt narrow reduces tokens and avoids the
    // AI inventing or duplicating academic conclusions.
    const systemPrompt = `You extract structured data from a student transcript at ${data.institution}.

EXTRACTION RULES:
- Identify every semester chronologically (Fall, Spring, Summer, Winter).
- Transcripts may be in English OR Arabic. Recognize Arabic semester names: خريف=Fall, ربيع=Spring, صيف=Summer, شتاء=Winter, and Arabic year digits (٠-٩).
- Some semesters (especially Summer terms) can span multiple pages — DO NOT drop a semester or course just because the table continues on the next page. Merge continuations into one semester.
- Detect repeated/retaken course attempts: list EVERY attempt of every course in the semester it occurred (do not collapse retakes into a single row).
- For each semester, extract: label, term type, status (e.g. "Enrolled", "Withdrawn", "Deferred", "Postponed"), semester GPA, cumulative GPA (CGPA), total credits attempted, and the full course list.
- Preserve the original status text when possible (e.g. keep "مقيد" as "مقيد"). The server normalizes Arabic statuses itself. If you must translate, map: "مقيد/مسجل/منتظم" → "Enrolled"; "غير مقيد" → "Not Enrolled"; "منسحب/انسحاب" → "Withdrawn"; "مؤجل/تأجيل" → "Deferred"; "موقوف/إيقاف قيد" → "Postponed"; "مفصول/فصل" → "Dismissed".
- Default status to "Enrolled" if the transcript does not specify.
- For each course: code, name, credits, letter grade, grade points (4.0 scale), and whether passed.
- Failing markers (passed=false): English letter grades F, FA, FW, W, I, IP, NP and any course explicitly marked failed/withdrawn/incomplete. Arabic failing markers: "راسب", "رسوب", "غ" (غائب), "م" (محروم), "منسحب", "ناقص" — treat these as passed=false. Passing markers: D and above on a 4.0 scale, or Arabic "ناجح".
- BE THOROUGH: scan every row of every semester, even when the transcript is in Arabic or mixes Arabic/English. Do not skip a row because the grade symbol is Arabic or because the cell contains a space (e.g. "C +" must be parsed as "C+").
- Normalize GPAs to a 4.00 scale. If the transcript uses a different scale, convert.
- DO NOT compute warning counters, dismissal risk, retake lists, recommendations, or summaries — the server applies those rules deterministically. Just extract truthfully.`;

    const userParts: Array<Record<string, unknown>> = [];
    if (data.text) {
      userParts.push({ text: `Transcript content:\n${data.text}` });
    }
    if (data.fileBase64 && data.mimeType) {
      userParts.push({
        inline_data: { mime_type: data.mimeType, data: data.fileBase64 },
      });
    }
    userParts.push({
      text: "Extract the transcript into the structured tool call. Be thorough — list every semester and every course.",
    });

    const functionDeclarations = [
      {
        name: "submit_transcript",
        description: "Submit the extracted transcript data",
        parameters: {
            type: "object",
            properties: {
              studentName: { type: ["string", "null"] },
              program: { type: ["string", "null"] },
              currentGPA: { type: ["number", "null"] },
              cgpa: { type: ["number", "null"] },
              totalCredits: { type: ["number", "null"] },
              semesters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    termType: {
                      type: "string",
                      enum: ["fall", "spring", "summer", "winter", "other"],
                    },
                    status: { type: ["string", "null"] },
                    gpa: { type: ["number", "null"] },
                    cgpa: { type: ["number", "null"] },
                    credits: { type: "number" },
                    courses: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          code: { type: "string" },
                          name: { type: "string" },
                          credits: { type: "number" },
                          grade: { type: "string" },
                          gradePoints: { type: ["number", "null"] },
                          passed: { type: "boolean" },
                        },
                        required: ["code", "name", "credits", "grade", "passed"],
                      },
                    },
                  },
                  required: ["label", "termType", "credits", "courses"],
                },
              },
            },
            required: ["semesters"],
        },
      },
    ];

    // Extraction-only AI call. failedCourses/warnings/recommendations/summary
    // are computed by Section 1 (deterministic) afterwards.
    const extracted = await callGeminiTool<Partial<AIRaw>>({
      apiKey,
      model: "gemini-2.5-flash",
      systemPrompt,
      userParts,
      functionDeclarations,
      toolName: "submit_transcript",
      temperature: 0,
    });
    const raw: AIRaw = {
      studentName: extracted.studentName ?? null,
      program: extracted.program ?? null,
      currentGPA: extracted.currentGPA ?? null,
      cgpa: extracted.cgpa ?? null,
      totalCredits: extracted.totalCredits ?? null,
      semesters: extracted.semesters ?? [],
      failedCourses: [],
      summary: "",
      warnings: [],
      recommendations: [],
    };
    const report = applyAcademicRules(raw, data.institution);
    // Section 1 narrative — always present, no AI dependency.
    const narrative = buildDeterministicNarrative(report, lang);
    return {
      ...report,
      summary: narrative.summary,
      warnings: narrative.warnings,
      recommendations: narrative.recommendations,
      aiNarrativeAvailable: false,
      aiNarrativeError: null,
    };
  });

// ---------- Pre-parsed (deterministic) transcript entry ----------
// Used when the client has already extracted structured semester data from a
// file format we can parse without AI (currently: Excel .xlsx/.xls/.csv).
// Skips the Gemini extraction call entirely and runs only the deterministic
// academic-rules pipeline + Section-1 narrative. The output shape is identical
// to analyzeTranscript() so downstream calculations and UI are unchanged.
type StructuredInput = {
  institution: string;
  lang?: "en" | "ar";
  parsed: {
    studentName: string | null;
    program: string | null;
    currentGPA: number | null;
    cgpa: number | null;
    totalCredits: number | null;
    semesters: Array<{
      label: string;
      termType: "fall" | "spring" | "summer" | "winter" | "other";
      status: string | null;
      gpa: number | null;
      cgpa: number | null;
      credits: number;
      courses: Array<{
        code: string;
        name: string;
        credits: number;
        grade: string;
        gradePoints: number | null;
        passed: boolean;
      }>;
    }>;
  };
};

export const analyzeStructuredTranscript = createServerFn({ method: "POST" })
  .inputValidator((data: StructuredInput) => {
    if (!data?.institution) throw new Error("Institution is required.");
    if (!data?.parsed) throw new Error("Parsed transcript is required.");
    if (!Array.isArray(data.parsed.semesters) || data.parsed.semesters.length === 0) {
      throw new Error("Parsed transcript has no semesters.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<AdvisorReport> => {
    const lang = data.lang ?? "en";
    const raw: AIRaw = {
      studentName: data.parsed.studentName ?? null,
      program: data.parsed.program ?? null,
      currentGPA: data.parsed.currentGPA ?? null,
      cgpa: data.parsed.cgpa ?? null,
      totalCredits: data.parsed.totalCredits ?? null,
      semesters: data.parsed.semesters.map((s) => ({
        label: s.label,
        termType: s.termType,
        status: s.status ?? undefined,
        gpa: s.gpa,
        cgpa: s.cgpa,
        credits: s.credits,
        courses: s.courses.map((c) => ({
          code: c.code,
          name: c.name,
          credits: c.credits,
          grade: c.grade,
          gradePoints: c.gradePoints,
          passed: c.passed,
        })),
      })),
      failedCourses: [],
      summary: "",
      warnings: [],
      recommendations: [],
    };
    const report = applyAcademicRules(raw, data.institution);
    const narrative = buildDeterministicNarrative(report, lang);
    return {
      ...report,
      summary: narrative.summary,
      warnings: narrative.warnings,
      recommendations: narrative.recommendations,
      aiNarrativeAvailable: false,
      aiNarrativeError: null,
    };
  });



type TranslateInput = {
  lang: "en" | "ar";
  summary: string;
  warnings: string[];
  recommendations: string[];
};

// ---------- Section 2: AI Recommendations & Suggestions (optional) ----------
// This server function is allowed to fail. The UI must keep showing the
// deterministic Section-1 report and surface only a localized notice in the
// AI recommendation card when ok=false.
export type AIRecommendationsResult =
  | {
      ok: true;
      summary: string;
      warnings: string[];
      recommendations: string[];
    }
  | { ok: false; error: string };

type AIRecsInput = {
  lang: "en" | "ar";
  report: AdvisorReport;
};

export const generateAIRecommendations = createServerFn({ method: "POST" })
  .inputValidator((data: AIRecsInput) => {
    if (!data?.lang) throw new Error("lang is required.");
    if (!data?.report) throw new Error("report is required.");
    return data;
  })
  .handler(async ({ data }): Promise<AIRecommendationsResult> => {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "missing_api_key" };
    }

    const ar = data.lang === "ar";
    const langName = ar ? "Arabic (اللغة العربية الفصحى)" : "English";
    // Compact snapshot of the deterministic report — keeps tokens low.
    const snapshot = {
      studentName: data.report.studentName,
      program: data.report.program,
      cgpa: data.report.cgpa,
      currentGPA: data.report.currentGPA,
      totalCredits: data.report.totalCredits,
      warningSemesterCount: data.report.warningSemesterCount,
      remainingSemesters: data.report.remainingSemesters,
      riskLevel: data.report.riskLevel,
      withdrawalRecommended: data.report.withdrawalRecommended,
      suggestedCreditLoad: data.report.suggestedCreditLoad,
      failedCourses: data.report.failedCourses.map((c) => ({
        code: c.code,
        name: c.name,
        credits: c.credits,
      })),
      semesters: data.report.semesters.map((s) => ({
        label: s.label,
        termType: s.termType,
        status: s.status,
        gpa: s.gpa,
        cgpa: s.cgpa,
        isWarningSemester: s.isWarningSemester,
        resetThisSemester: s.resetThisSemester,
        countedAsSummer: s.countedAsSummer,
      })),
    };

    const systemPrompt = `You are an academic advisor producing personalised guidance.

The server has already computed all academic figures (GPA, CGPA, warning count,
failed courses, risk level, suggested load). DO NOT recompute or contradict them.
Use them as ground truth.

Write a short, honest summary (2-4 sentences) describing standing and trajectory,
a warnings list (concrete issues the student should know about), and 4-7 concise,
actionable recommendations tailored to this student's data.

LANGUAGE (STRICT): Every free-text field must be written in ${langName}. Course
codes (e.g. CIS341) and semester labels (e.g. "Fall 2023") stay verbatim.`;

    const functionDeclarations = [
      {
        name: "submit_advice",
        description: "Submit AI-generated advisor narrative",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string" },
            warnings: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "warnings", "recommendations"],
        },
      },
    ];

    try {
      const parsed = await callGeminiTool<{
        summary: string;
        warnings: string[];
        recommendations: string[];
      }>({
        apiKey,
        model: "gemini-2.5-flash",
        systemPrompt,
        userParts: [
          {
            text: `Computed academic report:\n\n${JSON.stringify(snapshot)}\n\nProduce the advisor narrative via submit_advice. Write everything in ${langName}.`,
          },
        ],
        functionDeclarations,
        toolName: "submit_advice",
        temperature: 0.3,
      });
      return {
        ok: true,
        summary: parsed.summary ?? "",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ai_unavailable";
      console.error("generateAIRecommendations failed:", msg);
      return { ok: false, error: msg };
    }
  });

export const translateReportText = createServerFn({ method: "POST" })
  .inputValidator((data: TranslateInput) => {
    if (!data?.lang) throw new Error("lang is required.");
    return data;
  })
  .handler(
    async ({
      data,
    }): Promise<{ summary: string; warnings: string[]; recommendations: string[] }> => {
      const apiKey = process.env.GEMINI_API_KEY ?? process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

      const targetName =
        data.lang === "ar" ? "Arabic (اللغة العربية الفصحى)" : "English";

      const systemPrompt = `You translate academic advisor output into ${targetName}.

STRICT RULES:
- Every string in the output MUST be written in ${targetName}. Do NOT leave any sentence in the source language.
- Translate the "summary" string, EVERY item of the "warnings" array, and EVERY item of the "recommendations" array.
- Preserve numbers, GPA values, course codes (e.g. CS101, CIS341), and semester labels (e.g. "Fall 2023", "Spring 2024") verbatim — do not translate those tokens.
- Return EXACTLY the same number of warnings and recommendations as the input, in the same order.
- Do not add commentary or extra items.`;

      const functionDeclarations = [
        {
          name: "submit_translation",
          description: "Submit translated advisor text",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string" },
              warnings: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "warnings", "recommendations"],
          },
        },
      ];

      const userPayload = JSON.stringify({
        summary: data.summary,
        warnings: data.warnings,
        recommendations: data.recommendations,
      });

      const parsed = await callGeminiTool<{
        summary: string;
        warnings: string[];
        recommendations: string[];
      }>({
        apiKey,
        model: "gemini-2.5-flash",
        systemPrompt,
        userParts: [
          {
            text: `Translate every string in this JSON into ${targetName} and submit via the tool.\n\n${userPayload}`,
          },
        ],
        functionDeclarations,
        toolName: "submit_translation",
      });
      return {
        summary: parsed.summary ?? data.summary,
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : data.warnings,
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : data.recommendations,
      };
    },
  );