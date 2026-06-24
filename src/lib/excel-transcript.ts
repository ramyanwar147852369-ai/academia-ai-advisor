// Deterministic Excel (.xlsx/.xls/.csv) transcript parser.
// Produces the same structured shape that the Gemini extraction tool returns,
// so it can be fed directly into applyAcademicRules() on the server without
// consuming a single Gemini API call.
//
// The parser is heuristic but defensive: it walks every sheet row-by-row,
// detects semester headers (English + Arabic), course rows, GPA/CGPA rows,
// and enrollment status, and tolerates Arabic-Indic digits, mixed spacing,
// and assorted header layouts. If it cannot find any semester or course,
// it throws — the caller MUST surface a clear error and NOT fall back to AI.

import * as XLSX from "xlsx";
import { GRADE_CONFIG, STATUS_CONFIG } from "./transcript-config";

export type ParsedCourse = {
  code: string;
  name: string;
  credits: number;
  grade: string;
  gradePoints: number | null;
  passed: boolean;
};

export type ParsedSemester = {
  label: string;
  termType: "fall" | "spring" | "summer" | "winter" | "other";
  status: string | null;
  gpa: number | null;
  cgpa: number | null;
  credits: number;
  courses: ParsedCourse[];
};

export type ParsedTranscript = {
  studentName: string | null;
  program: string | null;
  currentGPA: number | null;
  cgpa: number | null;
  totalCredits: number | null;
  semesters: ParsedSemester[];
};

// ---------- helpers ----------

const arabicDigitsToAscii = (s: string) =>
  s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

const norm = (s: unknown) =>
  s === null || s === undefined ? "" : String(s).replace(/\s+/g, " ").trim();

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = arabicDigitsToAscii(String(v)).replace(/,/g, ".").trim();
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function cleanGradeToken(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function inferPassed(grade: string): boolean {
  return GRADE_CONFIG.isPassingGrade(grade);
}

function gradePointsFor(grade: string): number | null {
  return GRADE_CONFIG.gradeToPoints(grade);
}

// Letter-grade detector (English). Matches A+, B-, C, FA, FW, etc.
// Arabic standalone grades like "ناجح", "راسب", "غ", "م" handled separately.
const LETTER_GRADE_RE = GRADE_CONFIG.englishGradePattern;
const ARABIC_GRADE_RE = GRADE_CONFIG.arabicGradePattern;

function isGradeCell(v: string): boolean {
  const t = norm(v);
  if (!t) return false;
  const cleaned = t.replace(/\s+/g, "");
  if (LETTER_GRADE_RE.test(cleaned)) return true;
  if (ARABIC_GRADE_RE.test(t)) return true;
  return false;
}

// Course code detector. Examples: "CIS113", "CIS 113", "BAS-012", Arabic-digit
// variants, and redacted prefixes like "---291" used by some SIS exports.
// Accepts 2-6 letters/dashes (Latin or Arabic) followed by 2-5 digits.
const COURSE_CODE_RE = /^[A-Za-z\u0600-\u06FF\-]{2,6}[\s\-_.]*\d{2,5}[A-Za-z]?$/;

function isCourseCode(v: string): boolean {
  const t = arabicDigitsToAscii(norm(v));
  if (!t) return false;
  const cleaned = t.replace(/\s+/g, "");
  // Reject pure-dash / pure-digit strings to avoid false positives.
  if (!/\d/.test(cleaned)) return false;
  if (!/[A-Za-z\u0600-\u06FF\-]/.test(cleaned)) return false;
  return COURSE_CODE_RE.test(cleaned);
}

// Semester header detector. Matches:
//   "Fall 2023", "Spring 2019/2020", "Summer 2022",
//   "خريف 2023", "ربيع 2019/2020", "صيف 2022", "شتاء 2024",
//   "Fall Semester 2023", etc.
type TermType = ParsedSemester["termType"];
const TERM_KEYWORDS: Array<{ re: RegExp; type: TermType }> = [
  { re: /(fall|autumn|خريف)/i, type: "fall" },
  { re: /(spring|ربيع)/i, type: "spring" },
  { re: /(summer|صيف)/i, type: "summer" },
  { re: /(winter|شتاء)/i, type: "winter" },
];

function extractAcademicYear(text: string): string | null {
  const normalized = arabicDigitsToAscii(text);
  const m = normalized.match(/\b\d{4}(?:\s*[\/\-]\s*\d{4})?\b/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

function detectSemesterHeader(cells: string[]): { label: string; type: TermType } | null {
  const sources = [...cells.map(norm).filter(Boolean), cells.map(norm).filter(Boolean).join(" ")];
  for (const source of sources) {
    const normalized = arabicDigitsToAscii(source);
    const year = extractAcademicYear(normalized);
    if (!year) continue;
    for (const { re, type } of TERM_KEYWORDS) {
      if (!re.test(normalized)) continue;
      const { labelTerm } = semesterValueToTerm(normalized);
      return { label: `${labelTerm} ${year}`.trim(), type };
    }
  }
  return null;
}

// GPA / CGPA row detection. Returns { gpa?, cgpa? } if the row labels a GPA value.
const GPA_LABEL_RE = /\b(sem(ester)?\s*gpa|term\s*gpa|gpa)\b|معدل\s*الفصل|المعدل\s*الفصلي/i;
const CGPA_LABEL_RE = /\b(cum(ulative)?\s*gpa|cgpa)\b|المعدل\s*التراكمي|المعدل\s*التراكمى|التراكمي|التراكمى/i;

function findNearestNumber(cells: string[], pivot: number): number | null {
  let best: { dist: number; value: number; preferRight: number } | null = null;
  for (let i = 0; i < cells.length; i++) {
    const value = toNumber(cells[i]);
    if (value === null) continue;
    const dist = Math.abs(i - pivot);
    const preferRight = i >= pivot ? 0 : 1;
    if (!best || dist < best.dist || (dist === best.dist && preferRight < best.preferRight)) {
      best = { dist, value, preferRight };
    }
  }
  return best?.value ?? null;
}

function detectGpaRow(cells: string[]): { gpa?: number | null; cgpa?: number | null } | null {
  const text = cells.map(norm).join(" ");
  const out: { gpa?: number | null; cgpa?: number | null } = {};
  for (let i = 0; i < cells.length; i++) {
    const c = norm(cells[i]);
    if (!c) continue;
    if (CGPA_LABEL_RE.test(c)) {
      const inline = toNumber(c.replace(CGPA_LABEL_RE, ""));
      const next = inline ?? findNearestNumber(cells, i);
      if (next !== null) out.cgpa = next;
    } else if (GPA_LABEL_RE.test(c) && !CGPA_LABEL_RE.test(c)) {
      const inline = toNumber(c.replace(GPA_LABEL_RE, ""));
      const next = inline ?? findNearestNumber(cells, i);
      if (next !== null) out.gpa = next;
    }
  }
  if (out.gpa !== undefined || out.cgpa !== undefined) return out;
  if (GPA_LABEL_RE.test(text) || CGPA_LABEL_RE.test(text)) {
    return out.gpa !== undefined || out.cgpa !== undefined ? out : null;
  }
  return null;
}

function findFirstNumber(cells: string[]): number | null {
  for (const c of cells) {
    const n = toNumber(c);
    if (n !== null) return n;
  }
  return null;
}

// Status row detection
const STATUS_LABEL_RE = /\b(status|enrollment)\b|الحالة|حالة\s*الطالب|حالة\s*التسجيل|القيد/i;
function detectStatusRow(cells: string[]): string | null {
  for (let i = 0; i < cells.length; i++) {
    const c = norm(cells[i]);
    if (STATUS_LABEL_RE.test(c)) {
      // Value is the rest of this cell or the next non-empty cell.
      const inline = c.replace(STATUS_LABEL_RE, "").replace(/[:：-]/g, "").trim();
      if (inline) return inline;
      for (let j = i + 1; j < cells.length; j++) {
        const v = norm(cells[j]);
        if (v) return v;
      }
      for (let j = i - 1; j >= 0; j--) {
        const v = norm(cells[j]);
        if (v) return v;
      }
    }
  }
  return null;
}

// Registration Hours / SEM_CH detection (legacy RDLC layout). Matches
// English "Registration Hours 17" and Arabic "الساعات المسجلة 17" embedded
// inside a single cell of a GPA summary row.
const REG_HOURS_RE = /(registration\s*hours?|الساعات\s*المسجلة|ساعات\s*التسجيل)\s*[:：-]?\s*([\d\u0660-\u0669\u06F0-\u06F9]+(?:\.\d+)?)/i;
function detectRegistrationHours(cells: string[]): number | null {
  for (const c of cells) {
    const s = norm(c);
    if (!s) continue;
    const m = arabicDigitsToAscii(s).match(REG_HOURS_RE);
    if (m) {
      const n = toNumber(m[2]);
      if (n !== null && n > 0) return n;
    }
  }
  return null;
}

// Header-meta detection (student name, program). Only scanned in rows BEFORE the
// first semester header.
const NAME_LABEL_RE = /\b(student\s*name|name)\b|اسم\s*الطالب|الاسم/i;
const PROGRAM_LABEL_RE = /\b(program|major|department|college|faculty)\b|البرنامج|التخصص|القسم|الكلية/i;

function detectLabeledValue(cells: string[], labelRe: RegExp): string | null {
  for (let i = 0; i < cells.length; i++) {
    const c = norm(cells[i]);
    if (!c) continue;
    if (labelRe.test(c)) {
      const inline = c.replace(labelRe, "").replace(/[:：-]/g, "").trim();
      if (inline && !labelRe.test(inline)) return inline;
      for (let j = i + 1; j < cells.length; j++) {
        const v = norm(cells[j]);
        if (v) return v;
      }
    }
  }
  return null;
}

// ---------- course row parsing ----------

function parseCourseRow(cells: string[]): ParsedCourse | null {
  const trimmed = cells.map(norm);
  // Find indices.
  let codeIdx = -1;
  let gradeIdx = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (codeIdx === -1 && isCourseCode(trimmed[i])) codeIdx = i;
    if (isGradeCell(trimmed[i])) gradeIdx = i; // prefer last grade-like cell
  }
  if (codeIdx === -1 || gradeIdx === -1) return null;

  const code = arabicDigitsToAscii(trimmed[codeIdx]).replace(/\s+/g, "").toUpperCase();
  const grade = trimmed[gradeIdx];

  // Course name: longest text cell on the row that isn't the code, the grade,
  // a numeric value, or another grade/code token. Scanning the entire row
  // (instead of just code+1..grade-1) handles RTL Arabic RDLC layouts where
  // the code sits to the RIGHT of the name, and tolerates names that contain
  // digits (e.g. "Mathematics 1", "Physics 2").
  const isPureNumeric = (v: string) =>
    !!v && /^[\s\d.,\-\u0660-\u0669\u06F0-\u06F9]+$/.test(v);
  let name = "";
  for (let i = 0; i < trimmed.length; i++) {
    if (i === codeIdx || i === gradeIdx) continue;
    const v = trimmed[i];
    if (!v || v.length < 2) continue;
    if (isPureNumeric(v)) continue;
    if (isGradeCell(v)) continue;
    if (isCourseCode(v)) continue;
    if (v.length > name.length) name = v;
  }
  if (!name) name = code;

  // Credits: a small positive number (0.5–9) somewhere on the row,
  // preferring cells between code and grade.
  let credits = 0;
  const tryRange = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      const n = toNumber(trimmed[i]);
      if (n !== null && n > 0 && n <= 9) {
        credits = n;
        return true;
      }
    }
    return false;
  };
  if (!tryRange(codeIdx + 1, gradeIdx)) tryRange(0, trimmed.length);

  const gradePoints = gradePointsFor(grade);
  return {
    code,
    name,
    credits: credits || 0,
    grade,
    gradePoints,
    passed: inferPassed(grade),
  };
}

// ---------- column-based parsing ----------
//
// Some transcripts (the format produced by certain SIS exports) don't have
// "Fall 2023" headers separating sections. Instead every row is a course, and
// the semester it belongs to is identified by the values in dedicated
// "Academic Year" + "Semester" columns. Other columns hold course code, name,
// credit hours (CH), grade, semester GPA (SEM_GPA), cumulative GPA
// (ACCUM_GPA), and the enrollment status in Arabic (DESCR_AR) and English
// (DESCR_EN).
//
// We detect that layout by scanning each row for header keywords. If found
// we parse the file column-wise and group rows into semesters; otherwise we
// fall back to the legacy semester-block heuristic below.

type ColumnMap = {
  year: number;
  semester: number;
  code: number;
  name: number;
  credits: number;
  grade: number;
  symbol: number;
  semGpa: number;
  semCh: number;
  accumGpa: number;
  descrAr: number;
  descrEn: number;
};

// Column header patterns. Arabic header variants are listed alongside English
// ones so official Arabic SIS exports parse without needing Gemini.
const COL_PATTERNS: Array<{ key: keyof ColumnMap; re: RegExp }> = [
  { key: "year",     re: /^(academic[\s_]*year|acad[\s_]*year|year|السنة(\s*الدراسية|\s*الجامعية)?|سنة(\s*دراسية)?|العام(\s*الدراسي|\s*الجامعى|\s*الجامعي)?|عام)$/i },
  { key: "semester", re: /^(semester|term|الفصل(\s*الدراسي)?|فصل(\s*دراسي)?|الترم)$/i },
  { key: "code",     re: /^(course[\s_]*(code|no|number)|crse[\s_]*code|code|رمز(\s*المقرر|\s*المادة)?|رقم(\s*المقرر|\s*المادة)?|كود(\s*المقرر|\s*المادة)?)$/i },
  { key: "name",     re: /^(course([\s_]*(name|title|descr|description))?|crse([\s_]*name)?|name|title|اسم(\s*المقرر|\s*المادة)?|المقرر|المادة)$/i },
  { key: "credits",  re: /^(ch|cr|credit[\s_]*(hours?|hrs?)?|credits?|hrs?|units?|الساعات(\s*المعتمدة)?|ساعات(\s*معتمدة)?|الوحدات|عدد(\s*الساعات)?)$/i },
  { key: "grade",    re: /^(grade|gr|letter[\s_]*grade|final[\s_]*grade|تقدير|الدرجة|الدرجه|درجة|التقدير|النتيجة|الدرجة(\s*النهائية)?)$/i },
  { key: "symbol",   re: /^(symbol|sym|mark[\s_]*symbol|grade[\s_]*symbol|رمز(\s*التقدير|\s*الدرجة)?|الرمز|تقدير(\s*رمزي)?)$/i },
  { key: "semGpa",   re: /^(sem[\s_]*gpa|semester[\s_]*gpa|term[\s_]*gpa|gpa|معدل(\s*الفصل|\s*فصلي)?|المعدل(\s*الفصلي)?)$/i },
  { key: "semCh",    re: /^(sem[\s_]*ch|semester[\s_]*(ch|credit[\s_]*hours?|hours?)|term[\s_]*(ch|hours?)|registration[\s_]*hours?|الساعات\s*المسجلة|ساعات\s*التسجيل)$/i },
  { key: "accumGpa", re: /^(accum[\s_]*gpa|cum[\s_]*gpa|cumulative[\s_]*gpa|cgpa|المعدل[\s_]*التراكمي|المعدل\s*التراكمى|تراكمي)$/i },
  { key: "descrAr",  re: /^(descr[\s_]*ar|description[\s_]*ar|status[\s_]*ar|الوصف([\s_]*عربي)?|حالة(\s*القيد|\s*المقرر|\s*المادة|\s*الطالب|\s*التسجيل)?|الحالة)$/i },
  { key: "descrEn",  re: /^(descr[\s_]*en|description[\s_]*en|status[\s_]*en|status|enrollment(\s*status)?|description)$/i },
];

function detectColumnHeader(row: string[]): ColumnMap | null {
  const map: Partial<ColumnMap> = {};
  for (let i = 0; i < row.length; i++) {
    const v = norm(row[i]);
    if (!v) continue;
    for (const { key, re } of COL_PATTERNS) {
      if (map[key] === undefined && re.test(v)) {
        map[key] = i;
        break;
      }
    }
  }
  // Minimum viable header: semester + course code + at least one outcome
  // column (grade OR symbol OR Arabic/English description) so withdrawn
  // rows with an empty Grade still parse.
  const hasOutcome =
    map.grade !== undefined ||
    map.symbol !== undefined ||
    map.descrAr !== undefined ||
    map.descrEn !== undefined;
  if (map.semester === undefined || map.code === undefined || !hasOutcome) {
    return null;
  }
  return {
    year: map.year ?? -1,
    semester: map.semester,
    code: map.code,
    name: map.name ?? -1,
    credits: map.credits ?? -1,
    grade: map.grade ?? -1,
    symbol: map.symbol ?? -1,
    semGpa: map.semGpa ?? -1,
    semCh: map.semCh ?? -1,
    accumGpa: map.accumGpa ?? -1,
    descrAr: map.descrAr ?? -1,
    descrEn: map.descrEn ?? -1,
  };
}

// Classify an enrollment-status string by strength. Higher = more
// authoritative when a semester has multiple candidate strings. Non-enrolled
// (dismissed/withdrawn/deferred/...) ALWAYS beats enrolled — student-level
// "مقيد" on every row must never override a term-level "FINAL DISMISSED".
function statusStrength(s: string | null | undefined): number {
  return STATUS_CONFIG.statusStrength(s);
}

function pickStronger(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return statusStrength(b) > statusStrength(a) ? b : a;
}

function normalizeRawStatus(raw: string | null | undefined): string | null {
  const value = norm(raw);
  if (!value) return null;
  const stripped = value
    .replace(/^status\s*:/i, "")
    .replace(/^حالة\s*الطالب\s*:/, "")
    .trim();
  if (!stripped) return null;
  if (/^active$/i.test(stripped)) return "Enrolled";
  return stripped;
}

function chooseSemesterStatus(statuses: string[]): string | null {
  if (statuses.length === 0) return null;
  const counts = new Map<string, number>();
  for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = -1;
  let bestStrength = -1;
  for (const [status, count] of counts.entries()) {
    const strength = statusStrength(status);
    if (
      count > bestCount ||
      (count === bestCount && strength > bestStrength) ||
      (count === bestCount && strength === bestStrength && best === null)
    ) {
      best = status;
      bestCount = count;
      bestStrength = strength;
    }
  }
  return best;
}

function semesterValueToTerm(value: string): { type: TermType; labelTerm: string } {
  const v = norm(value);
  if (/fall|autumn|خريف|الأول|^اول$|first|^1$|^01$/i.test(v)) {
    return { type: "fall", labelTerm: "Fall" };
  }
  if (/spring|ربيع|الثاني|^ثاني$|second|^2$|^02$/i.test(v)) {
    return { type: "spring", labelTerm: "Spring" };
  }
  if (/summer|صيف|صيفي|الثالث|^ثالث$|third|^3$|^03$/i.test(v)) {
    return { type: "summer", labelTerm: "Summer" };
  }
  if (/winter|شتاء|^4$|^04$/i.test(v)) {
    return { type: "winter", labelTerm: "Winter" };
  }
  return { type: "other", labelTerm: v || "Term" };
}

function buildSemesterLabel(yearRaw: string, semRaw: string): string {
  const year = arabicDigitsToAscii(norm(yearRaw));
  const { labelTerm } = semesterValueToTerm(semRaw);
  if (year) return `${labelTerm} ${year}`;
  return labelTerm;
}

function parseColumnBased(allRows: string[][]): ParsedTranscript | null {
  let headerIdx = -1;
  let cols: ColumnMap | null = null;
  for (let i = 0; i < allRows.length; i++) {
    const m = detectColumnHeader(allRows[i]);
    if (m) {
      headerIdx = i;
      cols = m;
      break;
    }
  }
  if (!cols || headerIdx < 0) return null;

  let studentName: string | null = null;
  let program: string | null = null;
  for (let i = 0; i < headerIdx; i++) {
    const row = allRows[i];
    if (!studentName) studentName = detectLabeledValue(row, NAME_LABEL_RE);
    if (!program) program = detectLabeledValue(row, PROGRAM_LABEL_RE);
  }

  const groups = new Map<string, ParsedSemester>();
  const statusCandidates = new Map<string, string[]>();
  const semChValues = new Map<string, number>();
  const order: string[] = [];

  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || row.every((c) => norm(c) === "")) continue;
    const yearRaw = cols.year >= 0 ? norm(row[cols.year]) : "";
    const semRaw = norm(row[cols.semester] ?? "");
    const codeRaw = norm(row[cols.code] ?? "");
    const gradeRaw = cols.grade >= 0 ? norm(row[cols.grade] ?? "") : "";
    const symbolRaw = cols.symbol >= 0 ? norm(row[cols.symbol] ?? "") : "";
    const descrArRaw = cols.descrAr >= 0 ? norm(row[cols.descrAr] ?? "") : "";
    const descrEnRaw = cols.descrEn >= 0 ? norm(row[cols.descrEn] ?? "") : "";

    const normalizedYear = extractAcademicYear(yearRaw) ?? extractAcademicYear(semRaw) ?? "";
    if (!semRaw && !normalizedYear) continue;
    if (!codeRaw && !gradeRaw && !symbolRaw && !descrArRaw && !descrEnRaw) continue;

    const key = `${normalizedYear}||${semRaw}`;
    let sem = groups.get(key);
    if (!sem) {
      const { type } = semesterValueToTerm(semRaw);
      sem = {
        label: buildSemesterLabel(normalizedYear, semRaw),
        termType: type,
        status: null,
        gpa: null,
        cgpa: null,
        credits: 0,
        courses: [],
      };
      groups.set(key, sem);
      order.push(key);
    }

    if (codeRaw && isCourseCode(codeRaw)) {
      const code = arabicDigitsToAscii(codeRaw).replace(/\s+/g, "").toUpperCase();
      const name = cols.name >= 0 ? norm(row[cols.name]) || code : code;
      const creditsN = cols.credits >= 0 ? toNumber(row[cols.credits]) : null;
      const credits = creditsN && creditsN > 0 && creditsN <= 9 ? creditsN : 0;
      const effectiveGrade =
        gradeRaw || symbolRaw || descrArRaw || descrEnRaw || "";
      sem.courses.push({
        code,
        name,
        credits,
        grade: effectiveGrade,
        gradePoints: gradePointsFor(effectiveGrade),
        passed: inferPassed(effectiveGrade),
      });
      sem.credits += credits;
    }

    if (cols.semGpa >= 0) {
      const g = toNumber(row[cols.semGpa]);
      if (g !== null) sem.gpa = g;
    }
    if (cols.accumGpa >= 0) {
      const g = toNumber(row[cols.accumGpa]);
      if (g !== null) sem.cgpa = g;
    }
    // Semester registered hours from a dedicated SEM_CH / Registration Hours
    // column. When present this is the authoritative value for the semester
    // header and overrides the per-row credit sum.
    if (cols.semCh >= 0) {
      const ch = toNumber(row[cols.semCh]);
      if (ch !== null && ch > 0) semChValues.set(key, ch);
    }

      const rowStatus = pickStronger(
        normalizeRawStatus(descrEnRaw),
        normalizeRawStatus(descrArRaw),
      );
      if (rowStatus) {
        const list = statusCandidates.get(key) ?? [];
        list.push(rowStatus);
        statusCandidates.set(key, list);
        sem.status = chooseSemesterStatus(list);
      }
  }

  // Apply SEM_CH overrides (authoritative semester registered hours).
  for (const [key, ch] of semChValues.entries()) {
    const sem = groups.get(key);
    if (sem) sem.credits = ch;
  }


  if (order.length === 0) return null;
  const semesters = order.map((k) => groups.get(k)!);
  if (semesters.every((s) => s.courses.length === 0)) return null;

  let totalCredits = 0;
  for (const s of semesters) totalCredits += s.credits || 0;
  const lastWithCgpa = [...semesters].reverse().find((s) => s.cgpa !== null);
  const lastWithGpa = [...semesters].reverse().find((s) => s.gpa !== null);

  return {
    studentName,
    program,
    currentGPA: lastWithGpa?.gpa ?? null,
    cgpa: lastWithCgpa?.cgpa ?? null,
    totalCredits: totalCredits || null,
    semesters,
  };
}

// ---------- main entry ----------

export function parseExcelTranscript(buffer: ArrayBuffer): ParsedTranscript {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const allRows: string[][] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: true,
    });
    for (const row of json) {
      const cells = (row ?? []).map((c) => (c === null || c === undefined ? "" : String(c)));
      if (cells.some((c) => norm(c) !== "")) allRows.push(cells);
    }
    // Sentinel blank row between sheets so a semester block does not bleed across.
    allRows.push([]);
  }

  // Try column-based parsing first (e.g. Academic Year / Semester / Course
  // Code / ... / DESCR_AR / DESCR_EN layout). Fall back to legacy
  // semester-block heuristic.
  const columnParsed = parseColumnBased(allRows);
  if (columnParsed) return columnParsed;

  let studentName: string | null = null;
  let program: string | null = null;
  const semesters: ParsedSemester[] = [];
  let current: ParsedSemester | null = null;

  for (const row of allRows) {
    if (!row || row.length === 0 || row.every((c) => norm(c) === "")) continue;
    const cells = row;

    if (!current && semesters.length === 0) {
      if (!studentName) studentName = detectLabeledValue(cells, NAME_LABEL_RE);
      if (!program) program = detectLabeledValue(cells, PROGRAM_LABEL_RE);
    }

    const header = detectSemesterHeader(cells);
    if (header) {
      if (current) semesters.push(current);
      current = {
        label: header.label,
        termType: header.type,
        status: null,
        gpa: null,
        cgpa: null,
        credits: 0,
        courses: [],
      };
      const headerStatus = normalizeRawStatus(detectStatusRow(cells));
      if (headerStatus) current.status = headerStatus;
      continue;
    }

    if (!current) continue;

    const gpaRow = detectGpaRow(cells);
    if (gpaRow) {
      if (gpaRow.gpa !== undefined && gpaRow.gpa !== null) current.gpa = gpaRow.gpa;
      if (gpaRow.cgpa !== undefined && gpaRow.cgpa !== null) current.cgpa = gpaRow.cgpa;
      // The GPA summary row in RDLC exports also embeds Registration Hours
      // (English) / الساعات المسجلة (Arabic). When present this is the
      // authoritative semester registered-hours value and overrides the
      // per-course sum accumulated above.
      const regHours = detectRegistrationHours(cells);
      if (regHours !== null) current.credits = regHours;
      continue;
    }
    // Some RDLC layouts split Registration Hours onto its own row separate
    // from GPA. Detect those too.
    const regHoursOnly = detectRegistrationHours(cells);
    if (regHoursOnly !== null) {
      current.credits = regHoursOnly;
      continue;
    }

    const status = detectStatusRow(cells);
    if (status) {
      current.status = normalizeRawStatus(status);
      continue;
    }

    const course = parseCourseRow(cells);
    if (course) {
      current.courses.push(course);
      current.credits += course.credits || 0;
    }
  }
  if (current) semesters.push(current);

  if (semesters.length === 0 || semesters.every((s) => s.courses.length === 0)) {
    throw new Error(
      "Could not parse this Excel transcript. The file format was not recognized — please verify the spreadsheet contains either semester headers (e.g. \"Fall 2023\") or column headers like Academic Year, Semester, Course Code, Grade.",
    );
  }

  let totalCredits = 0;
  for (const s of semesters) totalCredits += s.credits || 0;
  const lastWithCgpa = [...semesters].reverse().find((s) => s.cgpa !== null);
  const lastWithGpa = [...semesters].reverse().find((s) => s.gpa !== null);

  return {
    studentName,
    program,
    currentGPA: lastWithGpa?.gpa ?? null,
    cgpa: lastWithCgpa?.cgpa ?? null,
    totalCredits: totalCredits || null,
    semesters,
  };
}
