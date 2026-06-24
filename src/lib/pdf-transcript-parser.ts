// Deterministic PDF transcript parser.
// Consumes output from pdf-text-extractor.ts and produces structured transcript data.
// Reference implementation: Excel Parser (excel-transcript.ts)
// Confidence/validation reference: Text Parser (text-transcript-parser.ts)
//
// RULE SOURCE TRACKING:
// - Reused from Excel Parser: course code detection, semester detection, GPA/CGPA detection, status detection
// - Reused from Text Parser: confidence scoring, validation rules
// - Reused from Centralized Config: GRADE_CONFIG, STATUS_CONFIG
// - PDF-specific: line-based parsing from extracted text (adapted from Text Parser's delimiter handling)

import { GRADE_CONFIG, STATUS_CONFIG } from "./transcript-config";
import type { PDFTextContent } from "./pdf-text-extractor";

// Reuse types from Excel Parser for consistency
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

export type TermType = ParsedSemester["termType"];

// --------------------------------------------------------------------------
// REUSED FROM EXCEL PARSER
// --------------------------------------------------------------------------

// Arabic digit normalization (Excel Parser line 45-48)
const arabicDigitsToAscii = (s: string) =>
  s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

// Normalization function (Excel Parser line 50-51)
const norm = (s: unknown) =>
  s === null || s === undefined ? "" : String(s).replace(/\s+/g, " ").trim();

// Number parsing with Arabic digit support (Excel Parser line 53-61)
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = arabicDigitsToAscii(String(v)).replace(/,/g, ".").trim();
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

// Grade cleaning (Excel Parser line 63-65)
function cleanGradeToken(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

// Pass/fail inference using GRADE_CONFIG (Excel Parser line 67-69)
function inferPassed(grade: string): boolean {
  return GRADE_CONFIG.isPassingGrade(grade);
}

// Grade points using GRADE_CONFIG (Excel Parser line 71-73)
function gradePointsFor(grade: string): number | null {
  return GRADE_CONFIG.gradeToPoints(grade);
}

// Letter grade detection using GRADE_CONFIG (Excel Parser line 75-87)
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

// Course code detection (Excel Parser line 89-102)
// REUSED FROM EXCEL PARSER
const COURSE_CODE_RE = /^[A-Za-z\u0600-\u06FF\-]{2,6}[\s\-_.]*\d{2,5}[A-Za-z]?$/;

function isCourseCode(v: string): boolean {
  const t = arabicDigitsToAscii(norm(v));
  if (!t) return false;
  const cleaned = t.replace(/\s+/g, "");
  if (!/\d/.test(cleaned)) return false;
  if (!/[A-Za-z\u0600-\u06FF\-]/.test(cleaned)) return false;
  const result = COURSE_CODE_RE.test(cleaned);
  console.log("[isCourseCode] Input:", v, "Cleaned:", cleaned, "Result:", result);
  return result;
}

// Semester header detection (Excel Parser line 104-135)
// REUSED FROM EXCEL PARSER
const TERM_KEYWORDS: Array<{ re: RegExp; type: TermType }> = [
  { re: /(fall|autumn|خريف)/i, type: "fall" },
  { re: /(spring|ربيع)/i, type: "spring" },
  { re: /(summer|صيف)/i, type: "summer" },
  { re: /(winter|شتاء)/i, type: "winter" },
];

function extractAcademicYear(text: string): string | null {
  const normalized = arabicDigitsToAscii(text);
  // Only match explicit year patterns like 2017/2018 or 2017-2018
  const m = normalized.match(/\b\d{4}[\/\-]\d{4}\b/);
  return m ? m[0] : null;
}

function detectSemesterHeader(text: string): { label: string; type: TermType } | null {
  const normalized = arabicDigitsToAscii(text);
  console.log("[detectSemesterHeader] Text:", text);
  
  // Explicit pattern: (Fall|Spring|Summer|Winter) followed by year like 2017/2018
  const semesterPattern = /^(Fall|Spring|Summer|Winter)\s+\d{4}[\/\-]\d{4}$/i;
  const match = normalized.match(semesterPattern);
  
  if (!match) {
    console.log("[detectSemesterHeader] No match for explicit semester pattern");
    return null;
  }
  
  const term = match[1];
  const year = normalized.substring(match[0].indexOf(term) + term.length).trim();
  
  // Map term to type
  const termLower = term.toLowerCase();
  let type: TermType = "other";
  let labelTerm = "Term";
  
  if (termLower === "fall" || termLower === "autumn") {
    type = "fall";
    labelTerm = "Fall";
  } else if (termLower === "spring") {
    type = "spring";
    labelTerm = "Spring";
  } else if (termLower === "summer") {
    type = "summer";
    labelTerm = "Summer";
  } else if (termLower === "winter") {
    type = "winter";
    labelTerm = "Winter";
  }
  
  const result = { label: `${labelTerm} ${year}`, type };
  console.log("[detectSemesterHeader] Detected:", result);
  return result;
}

// GPA/CGPA detection (Excel Parser line 138-176)
// REUSED FROM EXCEL PARSER
const GPA_LABEL_RE = /\b(sem(ester)?\s*gpa|term\s*gpa|gpa)\b|معدل\s*الفصل|المعدل\s*الفصلي/i;
const CGPA_LABEL_RE = /\b(cum(ulative)?\s*gpa|cgpa)\b|المعدل\s*التراكمي|المعدل\s*التراكمى|التراكمي|التراكمى/i;

function detectGpaFromLine(line: string): { gpa?: number | null; cgpa?: number | null } | null {
  const normalized = norm(line);
  const parts = line.split(/\s+/);
  const out: { gpa?: number | null; cgpa?: number | null } = {};
  
  // Check for "GPA : 2.55" pattern
  const gpaPattern = /gpa\s*[:：]\s*(\d+\.?\d*)/i;
  const gpaMatch = normalized.match(gpaPattern);
  if (gpaMatch) {
    out.gpa = parseFloat(gpaMatch[1]);
    return out;
  }
  
  // Check for "CGPA : 2.55" pattern
  const cgpaPattern = /cgpa\s*[:：]\s*(\d+\.?\d*)/i;
  const cgpaMatch = normalized.match(cgpaPattern);
  if (cgpaMatch) {
    out.cgpa = parseFloat(cgpaMatch[1]);
    return out;
  }
  
  // Original logic for other formats
  for (let i = 0; i < parts.length; i++) {
    const part = norm(parts[i]);
    if (!part) continue;
    if (CGPA_LABEL_RE.test(part)) {
      const inline = toNumber(part.replace(CGPA_LABEL_RE, ""));
      if (inline !== null) out.cgpa = inline;
      // Check next part for value
      else if (i + 1 < parts.length) {
        const next = toNumber(parts[i + 1]);
        if (next !== null) out.cgpa = next;
      }
    } else if (GPA_LABEL_RE.test(part) && !CGPA_LABEL_RE.test(part)) {
      const inline = toNumber(part.replace(GPA_LABEL_RE, ""));
      if (inline !== null) out.gpa = inline;
      // Check next part for value
      else if (i + 1 < parts.length) {
        const next = toNumber(parts[i + 1]);
        if (next !== null) out.gpa = next;
      }
    }
  }
  
  if (out.gpa !== undefined || out.cgpa !== undefined) return out;
  if (GPA_LABEL_RE.test(line) || CGPA_LABEL_RE.test(line)) return out;
  return null;
}

// Status detection (Excel Parser line 186-206)
// REUSED FROM EXCEL PARSER
const STATUS_LABEL_RE = /\b(status|enrollment)\b|الحالة|حالة\s*الطالب|حالة\s*التسجيل|القيد/i;

function detectStatusFromLine(line: string): string | null {
  const normalized = norm(line);
  // Check for "Status : Enrolled" pattern
  const statusPattern = /status\s*[:：]\s*(\w+)/i;
  const statusMatch = normalized.match(statusPattern);
  if (statusMatch) {
    return statusMatch[1].trim();
  }
  if (STATUS_LABEL_RE.test(normalized)) {
    const inline = normalized.replace(STATUS_LABEL_RE, "").replace(/[:：-]/g, "").trim();
    if (inline) return inline;
  }
  // Use STATUS_CONFIG for extraction
  return STATUS_CONFIG.extractStatus(line);
}

// Semester value to term conversion (Excel Parser line 440-455)
// REUSED FROM EXCEL PARSER
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

// Status strength using STATUS_CONFIG (Excel Parser line 396-398)
// REUSED FROM EXCEL PARSER
function statusStrength(s: string | null | undefined): number {
  return STATUS_CONFIG.statusStrength(s);
}

// --------------------------------------------------------------------------
// PDF-SPECIFIC: Line-based parsing from extracted text
// ADAPTED FROM TEXT PARSER (lines 124-133)
// --------------------------------------------------------------------------

// Split line by common delimiters (Text Parser line 124-133)
function splitLine(line: string): string[] {
  if (line.includes("|")) return line.split("|").map((s) => s.trim());
  if (line.includes(",")) return line.split(",").map((s) => s.trim());
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  return line.split(/\s+/).filter((s) => s.length > 0);
}

// Check if line looks like a course code (Text Parser line 136-156)
// ADAPTED FROM TEXT PARSER
function looksLikeCourseCode(line: string): boolean {
  const trimmed = line.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 0) return false;
  
  const firstPart = parts[0];
  if (isCourseCode(firstPart)) return true;
  
  if (parts.length >= 2) {
    const firstTwo = parts[0] + " " + parts[1];
    if (isCourseCode(firstTwo)) return true;
  }
  
  return false;
}

// Parse a course line (adapted from Text Parser line 164-273)
// PDF-SPECIFIC: Adapted for PDF-extracted text which may have different spacing
function parseCourseLine(line: string): ParsedCourse | null {
  console.log("[parseCourseLine] Input line:", line);
  const parts = splitLine(line);
  console.log("[parseCourseLine] Split parts:", parts);
  if (parts.length < 3) {
    console.log("[parseCourseLine] Rejected: less than 3 parts");
    return null;
  }

  let code: string | null = null;
  let name: string | null = null;
  let grade: string | null = null;
  let credits: number | null = null;

  // Find course code
  let codeIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (isCourseCode(parts[i])) {
      code = parts[i];
      codeIndex = i;
      break;
    }
  }
  
  // Check for space-separated code
  if (!code && parts.length >= 2) {
    const twoPartCode = parts[0] + " " + parts[1];
    if (isCourseCode(twoPartCode)) {
      code = twoPartCode;
      codeIndex = 0;
      parts.splice(1, 1);
      parts[0] = code;
    }
  }

  if (!code) {
    console.log("[parseCourseLine] Rejected: no course code found");
    return null;
  }
  console.log("[parseCourseLine] Course code found:", code, "at index:", codeIndex);

  // Find grade using GRADE_CONFIG
  let gradeCandidates: Array<{ index: number; value: string; length: number }> = [];
  for (let i = 0; i < parts.length; i++) {
    if (GRADE_CONFIG.isValidGrade(parts[i])) {
      gradeCandidates.push({ index: i, value: parts[i], length: parts[i].length });
    }
  }
  console.log("[parseCourseLine] Grade candidates:", gradeCandidates);
  if (gradeCandidates.length > 0) {
    const longestGrade = gradeCandidates.reduce((a, b) => a.length > b.length ? a : b);
    grade = longestGrade.value;
    console.log("[parseCourseLine] Selected grade:", grade);
  }

  // Find credits
  for (let i = 0; i < parts.length; i++) {
    const cred = toNumber(parts[i]);
    if (cred !== null && cred > 0 && cred <= 9) {
      credits = cred;
      console.log("[parseCourseLine] Found credits:", credits, "at index:", i);
    }
  }

  // Build name from remaining parts
  const nameParts: string[] = [];
  for (let i = codeIndex + 1; i < parts.length; i++) {
    if (grade !== null && parts[i] === grade) continue;
    if (credits !== null && parts[i] === credits.toString()) continue;
    nameParts.push(parts[i]);
  }
  name = nameParts.join(" ").trim();
  console.log("[parseCourseLine] Course name:", name);

  if (!name || name.length === 0) {
    console.log("[parseCourseLine] Rejected: no course name");
    return null;
  }

  // Fallback grade
  if (!grade) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const cred = toNumber(part);
      if (cred === null && part !== code && part !== name) {
        grade = part;
        break;
      }
    }
    if (!grade) grade = "Unknown";
    console.log("[parseCourseLine] Fallback grade:", grade);
  }

  const gradePoints = gradePointsFor(grade);
  const passed = inferPassed(grade);

  const result = {
    code,
    name,
    credits: credits ?? 0,
    grade,
    gradePoints,
    passed,
  };
  console.log("[parseCourseLine] Parsed course:", result);
  return result;
}

// --------------------------------------------------------------------------
// Main PDF Parser Function
// --------------------------------------------------------------------------

export function parsePDFTranscript(content: PDFTextContent): ParsedTranscript | null {
  // Combine all pages into a single text stream
  let fullText = content.fullText;

  if (!fullText || fullText.length === 0) return null;

  // Remove page headers and footers
  fullText = fullText.replace(/Page \d+ of \d+/gi, "");
  fullText = fullText.replace(/Academic Transcript/gi, "");
  fullText = fullText.replace(/Ministry of High Education/gi, "");
  fullText = fullText.replace(/Ministry of Higher Education/gi, "");

  console.log("[parsePDFTranscript] Total text length:", fullText.length);

  // Extract student name
  let studentName: string | null = null;
  const namePattern = /Name\s*[:：]\s*(.+)/i;
  const nameMatch = fullText.match(namePattern);
  if (nameMatch) {
    studentName = nameMatch[1].trim();
    console.log("[Student Name]", studentName);
  }

  // Global scan for semester headers
  const semesterPattern = /(Fall|Spring|Summer|Winter)\s+\d{4}[\/\-]\d{4}/gi;
  const semesterMatches: Array<{ match: string; index: number; label: string; type: TermType }> = [];
  let match;

  while ((match = semesterPattern.exec(fullText)) !== null) {
    const term = match[1];
    const year = fullText.substring(match.index + term.length, match.index + match[0].length).trim();
    
    // Map term to type
    const termLower = term.toLowerCase();
    let type: TermType = "other";
    let labelTerm = "Term";
    
    if (termLower === "fall" || termLower === "autumn") {
      type = "fall";
      labelTerm = "Fall";
    } else if (termLower === "spring") {
      type = "spring";
      labelTerm = "Spring";
    } else if (termLower === "summer") {
      type = "summer";
      labelTerm = "Summer";
    } else if (termLower === "winter") {
      type = "winter";
      labelTerm = "Winter";
    }
    
    const label = `${labelTerm} ${year}`;
    semesterMatches.push({ match: match[0], index: match.index, label, type });
    console.log("[Semester Found]", label);
  }

  console.log("[Semester Count]", semesterMatches.length);

  // Extract total pass hours
  let totalCredits: number | null = null;
  const totalPassHoursPattern = /Total Pass Hours\s*[:：]\s*(\d+)/i;
  const totalPassMatch = fullText.match(totalPassHoursPattern);
  if (totalPassMatch) {
    totalCredits = parseInt(totalPassMatch[1], 10);
    console.log("[Total Pass Hours]", totalCredits);
  }

  if (semesterMatches.length === 0) return null;

  // Split text into semester sections
  const semesters: ParsedSemester[] = [];
  
  for (let i = 0; i < semesterMatches.length; i++) {
    const currentMatch = semesterMatches[i];
    const nextMatch = semesterMatches[i + 1];
    
    // Extract semester section text
    const startIndex = currentMatch.index;
    const endIndex = nextMatch ? nextMatch.index : fullText.length;
    const sectionText = fullText.substring(startIndex, endIndex);
    
    console.log("[Semester Section]", currentMatch.label, "text length:", sectionText.length);
    
    // Parse courses from section using regex
    const courses: ParsedCourse[] = [];
    let gpa: number | null = null;
    let cgpa: number | null = null;
    let status: string | null = null;
    
    // Regex for structured table transcript: code title credits points grade
    const coursePattern = /([A-Z]{3,4}[A-Za-z0-9]{2,4}|---291|---391|HUMX76|HUMX73|HUMX75)\s+(.+?)\s+(\d+)\s+(\d+\.\d+)\s+([A-F][+-]?|P|NP)/g;
    const courseMatches: Array<{ code: string; title: string; credits: string; points: string; grade: string }> = [];
    let courseMatch;
    
    while ((courseMatch = coursePattern.exec(sectionText)) !== null) {
      courseMatches.push({
        code: courseMatch[1],
        title: courseMatch[2].trim(),
        credits: courseMatch[3],
        points: courseMatch[4],
        grade: courseMatch[5],
      });
    }
    
    console.log("[Semester]", currentMatch.label);
    console.log("[Matches Found]", courseMatches.length);
    console.log(courseMatches);
    
    // Convert matches to ParsedCourse objects
    for (const match of courseMatches) {
      const credits = toNumber(match.credits);
      const gradePoints = gradePointsFor(match.grade);
      const passed = inferPassed(match.grade);
      
      courses.push({
        code: match.code,
        name: match.title,
        credits: credits ?? 0,
        grade: match.grade,
        gradePoints,
        passed,
      });
    }
    
    // Also check for GPA/CGPA in the section (using line-based detection for these)
    const lines = sectionText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) {
      const gpaResult = detectGpaFromLine(line);
      if (gpaResult) {
        if (gpaResult.gpa !== undefined) gpa = gpaResult.gpa;
        if (gpaResult.cgpa !== undefined) cgpa = gpaResult.cgpa;
      }
      const lineStatus = detectStatusFromLine(line);
      if (lineStatus && !line.toLowerCase().includes("gpa") && !line.includes("معدل")) {
        status = lineStatus;
      }
    }
    
    semesters.push({
      label: currentMatch.label,
      termType: currentMatch.type,
      status: status || "Enrolled",
      gpa,
      cgpa,
      credits: courses.reduce((sum, c) => sum + c.credits, 0),
      courses,
    });
  }

  if (semesters.length === 0) return null;

  // Calculate overall CGPA from last semester
  const lastSemester = semesters[semesters.length - 1];
  const overallCGPA = lastSemester.cgpa;

  return {
    studentName,
    program: null,
    currentGPA: lastSemester.gpa,
    cgpa: overallCGPA,
    totalCredits: totalCredits ?? semesters.reduce((sum, s) => sum + s.credits, 0),
    semesters,
  };
}

// --------------------------------------------------------------------------
// Confidence Scoring (ADAPTED FROM TEXT PARSER lines 449-519)
// --------------------------------------------------------------------------

export interface ConfidenceScore {
  score: number;
  details: {
    courseDetection: number;
    gradeDetection: number;
    creditDetection: number;
    semesterDetection: number;
    gpaDetection: number;
  };
}

export function calculateConfidence(transcript: ParsedTranscript): ConfidenceScore {
  const totalCourses = transcript.semesters.reduce((sum, s) => sum + s.courses.length, 0);

  // Course detection (30% weight)
  let courseDetection = 0;
  if (totalCourses >= 3) courseDetection = 1.0;
  else if (totalCourses >= 1) courseDetection = 0.5;

  // Grade detection (25% weight)
  const coursesWithGrades = transcript.semesters.reduce(
    (sum, s) => sum + s.courses.filter((c) => GRADE_CONFIG.isValidGrade(c.grade)).length,
    0
  );
  let gradeDetection = 0;
  if (totalCourses > 0) {
    const gradeRatio = coursesWithGrades / totalCourses;
    if (gradeRatio >= 0.9) gradeDetection = 1.0;
    else if (gradeRatio >= 0.5) gradeDetection = 0.7;
  }

  // Credit detection (20% weight)
  const coursesWithCredits = transcript.semesters.reduce(
    (sum, s) => sum + s.courses.filter((c) => c.credits > 0).length,
    0
  );
  let creditDetection = 0;
  if (totalCourses > 0) {
    const creditRatio = coursesWithCredits / totalCourses;
    if (creditRatio >= 0.9) creditDetection = 1.0;
    else if (creditRatio >= 0.5) creditDetection = 0.7;
  }

  // Semester detection (15% weight)
  const semesterDetection = transcript.semesters.length >= 1 ? 1.0 : 0.0;

  // GPA/CGPA detection (5% weight)
  let gpaDetection = 0;
  if (transcript.currentGPA !== null && transcript.cgpa !== null) gpaDetection = 1.0;
  else if (transcript.currentGPA !== null || transcript.cgpa !== null) gpaDetection = 0.5;

  const score =
    courseDetection * 0.3 +
    gradeDetection * 0.25 +
    creditDetection * 0.2 +
    semesterDetection * 0.15 +
    gpaDetection * 0.05;

  return {
    score,
    details: {
      courseDetection,
      gradeDetection,
      creditDetection,
      semesterDetection,
      gpaDetection,
    },
  };
}

// --------------------------------------------------------------------------
// Validation (ADAPTED FROM TEXT PARSER lines 521-593)
// --------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTranscript(transcript: ParsedTranscript): ValidationResult {
  const errors: string[] = [];

  if (transcript.semesters.length === 0) {
    errors.push("No semesters found");
  }

  for (const semester of transcript.semesters) {
    for (const course of semester.courses) {
      if (!course.code || course.code.trim().length === 0) {
        errors.push(`Course missing code: ${course.name}`);
      }
    }
  }

  for (const semester of transcript.semesters) {
    for (const course of semester.courses) {
      if (!course.name || course.name.trim().length === 0) {
        errors.push(`Course missing name: ${course.code}`);
      }
    }
  }

  for (const semester of transcript.semesters) {
    for (const course of semester.courses) {
      if (!GRADE_CONFIG.isValidGrade(course.grade)) {
        errors.push(`Invalid grade: ${course.grade} for course ${course.code}`);
      }
    }
  }

  if (transcript.semesters.length > 0) {
    const totalCourses = transcript.semesters.reduce((sum, s) => sum + s.courses.length, 0);
    if (totalCourses === 0) {
      errors.push("No courses found in any semester");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
