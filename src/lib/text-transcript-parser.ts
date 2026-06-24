// Deterministic text transcript parser.
// Parses pasted transcript text into structured format matching the Excel parser output.
// Supports multiple delimiters (space, pipe, comma, tab) and common transcript formats.
// Does NOT perform academic calculations - only extracts transcript data.

import { GRADE_CONFIG, STATUS_CONFIG } from "./transcript-config";

export type TermType = "fall" | "spring" | "summer" | "winter" | "other";

export interface ParsedCourse {
  code: string;
  name: string;
  credits: number;
  grade: string;
  gradePoints: number | null;
  passed: boolean;
}

export interface ParsedSemester {
  label: string;
  termType: TermType;
  status: string | null;
  gpa: number | null;
  cgpa: number | null;
  credits: number;
  courses: ParsedCourse[];
}

export interface ParsedTranscript {
  studentName: string | null;
  program: string | null;
  currentGPA: number | null;
  cgpa: number | null;
  totalCredits: number | null;
  semesters: ParsedSemester[];
}

// Course code patterns - flexible and extensible
const COURSE_CODE_PATTERNS = [
  // Redacted/partial codes: ---391, ---291 (dashes followed by digits)
  /^[-]{2,}\d{2,4}[A-Za-z]?$/,
  // Long prefix first (must be checked before standard patterns): COMP2401, IT101A
  /^[A-Za-z]{4,6}\d{3,4}[A-Za-z]?$/,
  // Standard with flexible digit count: CS101, MATH201, HUMX76, HUMx75 (2-4 digits)
  /^[A-Za-z]{2,6}\d{1,4}[A-Za-z]?$/,
  // With dash: ENG-101
  /^[A-Za-z]{2,4}-\d{3,4}[A-Za-z]?$/,
  // With underscore: CS_101
  /^[A-Za-z]{2,4}_\d{3,4}[A-Za-z]?$/,
  // With space: MATH 101
  /^[A-Za-z]{2,4}\s\d{3,4}[A-Za-z]?$/,
  // Arabic patterns (basic)
  /^[أ-ي]{2,4}\d{3,4}[أ-ي]?$/,
];

function isValidCourseCode(code: string): boolean {
  const trimmed = code.trim();
  return COURSE_CODE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isValidGrade(grade: string): boolean {
  return GRADE_CONFIG.isValidGrade(grade);
}

function isPassingGrade(grade: string): boolean {
  return GRADE_CONFIG.isPassingGrade(grade);
}

function gradeToPoints(grade: string): number | null {
  return GRADE_CONFIG.gradeToPoints(grade);
}

// Semester header patterns (English and Arabic)
const SEMESTER_PATTERNS = {
  fall: /(?:^|\s)(fall|خريف)(?:\s|$)/i,
  spring: /(?:^|\s)(spring|ربيع)(?:\s|$)/i,
  summer: /(summer|صيف)/i,
  winter: /(?:^|\s)(winter|شتاء)(?:\s|$)/i,
};

function detectTermType(label: string): TermType {
  const lower = label.toLowerCase();
  if (SEMESTER_PATTERNS.fall.test(lower)) return "fall";
  if (SEMESTER_PATTERNS.spring.test(lower)) return "spring";
  if (SEMESTER_PATTERNS.summer.test(lower)) return "summer";
  if (SEMESTER_PATTERNS.winter.test(lower)) return "winter";
  return "other";
}

// Credit patterns (numeric, including Arabic digits)
function parseCredits(value: string): number | null {
  const trimmed = value.trim();
  // Arabic digits to English
  const arabicToEnglish = (str: string): string => {
    const map: Record<string, string> = {
      "٠": "0",
      "١": "1",
      "٢": "2",
      "٣": "3",
      "٤": "4",
      "٥": "5",
      "٦": "6",
      "٧": "7",
      "٨": "8",
      "٩": "9",
    };
    return str.replace(/[٠-٩]/g, (match) => map[match] || match);
  };
  const normalized = arabicToEnglish(trimmed);
  const num = parseFloat(normalized);
  if (isNaN(num) || num < 0 || num > 10) return null;
  return num;
}

// GPA/CGPA patterns
function parseGPA(value: string): number | null {
  const trimmed = value.trim();
  const num = parseFloat(trimmed);
  if (isNaN(num) || num < 0 || num > 4.0) return null;
  return num;
}

// Split line by common delimiters
function splitLine(line: string): string[] {
  // Try pipe first
  if (line.includes("|")) return line.split("|").map((s) => s.trim());
  // Try comma
  if (line.includes(",")) return line.split(",").map((s) => s.trim());
  // Try tab
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  // Fall back to space (collapse multiple spaces)
  return line.split(/\s+/).filter((s) => s.length > 0);
}

// Check if a line starts with a valid course code (to avoid misidentifying as semester header)
function looksLikeCourseCode(line: string): boolean {
  const trimmed = line.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 0) return false;
  
  // Check if the first part matches any course code pattern
  const firstPart = parts[0];
  if (COURSE_CODE_PATTERNS.some((pattern) => pattern.test(firstPart))) {
    return true;
  }
  
  // Check if the first two parts together form a space-separated course code (e.g., "MATH 101")
  if (parts.length >= 2) {
    const firstTwo = parts[0] + " " + parts[1];
    if (COURSE_CODE_PATTERNS.some((pattern) => pattern.test(firstTwo))) {
      return true;
    }
  }
  
  return false;
}

// Extract enrollment status from line
function extractStatus(line: string): string | null {
  return STATUS_CONFIG.extractStatus(line);
}

// Parse a single course line
function parseCourseLine(line: string): ParsedCourse | null {
  const parts = splitLine(line);
  if (parts.length < 3) return null;

  // Try to identify course code, name, grade, credits
  let code: string | null = null;
  let name: string | null = null;
  let grade: string | null = null;
  let credits: number | null = null;

  // Find course code (handle multi-part codes like "MATH 101")
  let codeIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (isValidCourseCode(parts[i])) {
      code = parts[i];
      codeIndex = i;
      break;
    }
  }
  
  // If no single-part code found, check for space-separated code (first two parts)
  if (!code && parts.length >= 2) {
    const twoPartCode = parts[0] + " " + parts[1];
    if (isValidCourseCode(twoPartCode)) {
      code = twoPartCode;
      codeIndex = 0;
      // Remove the second part from parts since it's part of the code
      parts.splice(1, 1);
      // Replace the first part with the full code so indexOf works later
      parts[0] = code;
    }
  }

  if (!code) return null;

  // Find grade - prefer longer grade patterns (e.g., "B+" over "I")
  let gradeCandidates: Array<{ index: number; value: string; length: number }> = [];
  for (let i = 0; i < parts.length; i++) {
    if (isValidGrade(parts[i])) {
      gradeCandidates.push({ index: i, value: parts[i], length: parts[i].length });
    }
  }
  // Use the longest grade match (prefer "B+" over "I")
  if (gradeCandidates.length > 0) {
    const longestGrade = gradeCandidates.reduce((a, b) => a.length > b.length ? a : b);
    grade = longestGrade.value;
  }

  // Find credits - prefer the last numeric value to avoid picking up numbers in course names
  let creditCandidates: Array<{ index: number; value: number }> = [];
  for (let i = 0; i < parts.length; i++) {
    const cred = parseCredits(parts[i]);
    if (cred !== null) {
      creditCandidates.push({ index: i, value: cred });
    }
  }
  // Use the last credit candidate (most likely to be the actual credit value)
  if (creditCandidates.length > 0) {
    const lastCredit = creditCandidates[creditCandidates.length - 1];
    credits = lastCredit.value;
  }

  // Course name is everything between code and grade/credits
  // codeIndex is already tracked above
  // Re-find grade and credit indices after potential array modifications
  const gradeIndex = grade !== null ? parts.indexOf(grade) : -1;
  const creditIndex = credits !== null ? parts.indexOf(credits.toString()) : -1;

  if (codeIndex === -1) return null;

  // Build name from remaining parts
  const nameParts: string[] = [];
  for (let i = codeIndex + 1; i < parts.length; i++) {
    // Skip grade and credit by value, not just index (more robust)
    if (grade !== null && parts[i] === grade) continue;
    if (credits !== null && parts[i] === credits.toString()) continue;
    nameParts.push(parts[i]);
  }
  name = nameParts.join(" ").trim();

  if (!name || name.length === 0) return null;

  // If grade is missing or invalid, still return the course for validation error reporting
  // Use the raw grade value even if it's invalid
  if (!grade) {
    // Try to use the last non-credit, non-code part as the grade (might be invalid)
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const cred = parseCredits(part);
      if (cred === null && part !== code && part !== name) {
        grade = part;
        break;
      }
    }
    // If still no grade, use placeholder
    if (!grade) grade = "Unknown";
  }

  const gradePoints = gradeToPoints(grade);
  const passed = isPassingGrade(grade);

  return {
    code,
    name,
    credits: credits ?? 0,
    grade,
    gradePoints,
    passed,
  };
}

// Main parser function
export function parseTextTranscript(text: string): ParsedTranscript | null {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  const semesters: ParsedSemester[] = [];
  let currentSemester: ParsedSemester | null = null;
  let currentCourses: ParsedCourse[] = [];

  for (const line of lines) {
    // Check if this is a semester header
    // IMPORTANT: Check if line looks like a course code FIRST to avoid misidentification
    const looksLikeCode = looksLikeCourseCode(line);
    
    if (looksLikeCode) {
      // This looks like a course code, don't treat as semester header
      // Fall through to course parsing below
    } else {
      const termType = detectTermType(line);
      const hasYear = /(?:\d{4}|٢٠٢\d)/.test(line);
      
      if (termType !== "other" || hasYear) {
        // Save previous semester if exists (even if no courses)
        if (currentSemester) {
          currentSemester.courses = currentCourses;
          currentSemester.credits = currentCourses.reduce((sum, c) => sum + c.credits, 0);
          semesters.push(currentSemester);
        }

        // Extract status from the line if present
        const extractedStatus = extractStatus(line);

        // Start new semester
        currentSemester = {
          label: line,
          termType,
          status: extractedStatus || "Enrolled",
          gpa: null,
          cgpa: null,
          credits: 0,
          courses: [],
        };
        currentCourses = [];
        continue;
      }
      
      // Check if this is a status line (standalone status without semester header)
      // IMPORTANT: Only check for status lines if the line does NOT look like a course code
      const status = extractStatus(line);
      if (status && !line.toLowerCase().includes("gpa") && !line.includes("معدل")) {
        if (currentSemester) {
          currentSemester.status = status;
        }
        continue;
      }
    }

    // Check if this is a GPA/CGPA line
    if (line.toLowerCase().includes("gpa") || line.includes("معدل")) {
      const parts = splitLine(line);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const partLower = part.toLowerCase();
        
        // Check if this part contains a keyword and value (e.g., "CGPA 1.99" or "GPA 1.90")
        // Support all Arabic variants: الفصلي, الفصلى, التراكمي, التراكمى
        if (partLower.includes("cgpa") || partLower.includes("تراكمي") || partLower.includes("تراكمى") || partLower.includes("gpa") || partLower.includes("معدل")) {
          // Extract the numeric value from this part
          const subParts = part.split(/\s+/);
          for (const subPart of subParts) {
            const gpa = parseGPA(subPart);
            if (gpa !== null) {
              // Check for CGPA keywords first
              if (partLower.includes("cgpa") || partLower.includes("تراكمي") || partLower.includes("تراكمى")) {
                if (currentSemester) currentSemester.cgpa = gpa;
              } 
              // Check for GPA keywords (but not CGPA)
              else if ((partLower.includes("gpa") && !partLower.includes("cgpa")) || 
                       (partLower.includes("معدل") && !partLower.includes("تراكمي") && !partLower.includes("تراكمى"))) {
                if (currentSemester) currentSemester.gpa = gpa;
              }
            }
          }
          continue;
        }
        
        const gpa = parseGPA(part);
        if (gpa !== null) {
          // Look at the previous part to determine if this is CGPA or GPA
          if (i > 0) {
            const prevPart = parts[i - 1].toLowerCase();
            if (prevPart.includes("cgpa") || prevPart.includes("تراكمي") || prevPart.includes("تراكمى")) {
              if (currentSemester) currentSemester.cgpa = gpa;
              continue;
            }
            if ((prevPart.includes("gpa") && !prevPart.includes("cgpa")) || 
                (prevPart.includes("معدل") && !prevPart.includes("تراكمي") && !prevPart.includes("تراكمى"))) {
              if (currentSemester) currentSemester.gpa = gpa;
              continue;
            }
            // Check for Arabic GPA/CGPA indicators in previous parts
            // Look further back for الفصلي/الفصلى (GPA) or التراكمي/التراكمى (CGPA)
            for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
              const lookbackPart = parts[j].toLowerCase();
              if (lookbackPart.includes("فصلي") || lookbackPart.includes("فصلى")) {
                if (currentSemester) currentSemester.gpa = gpa;
                continue;
              }
              if (lookbackPart.includes("تراكمي") || lookbackPart.includes("تراكمى")) {
                if (currentSemester) currentSemester.cgpa = gpa;
                continue;
              }
            }
          }
          // Fallback: check if this part itself contains the keyword
          if (partLower.includes("cgpa") || partLower.includes("تراكمي") || partLower.includes("تراكمى")) {
            if (currentSemester) currentSemester.cgpa = gpa;
          } else if (partLower.includes("gpa") || 
                     (partLower.includes("معدل") && !partLower.includes("تراكمي") && !partLower.includes("تراكمى"))) {
            if (currentSemester) currentSemester.gpa = gpa;
          } else {
            // No keyword found, default to GPA if line doesn't contain CGPA
            if (!line.toLowerCase().includes("cgpa") && !line.includes("تراكمي") && !line.includes("تراكمى")) {
              if (currentSemester) currentSemester.gpa = gpa;
            }
          }
        }
      }
      continue;
    }

    // Try to parse as course line
    const course = parseCourseLine(line);
    if (course) {
      if (!currentSemester) {
        // Create default semester if no header found
        currentSemester = {
          label: "Unknown Semester",
          termType: "other",
          status: "Enrolled",
          gpa: null,
          cgpa: null,
          credits: 0,
          courses: [],
        };
      }
      currentCourses.push(course);
    }
  }

  // Save last semester (even if no courses)
  if (currentSemester) {
    currentSemester.courses = currentCourses;
    currentSemester.credits = currentCourses.reduce((sum, c) => sum + c.credits, 0);
    semesters.push(currentSemester);
  }

  if (semesters.length === 0) return null;

  // Calculate overall CGPA from last semester
  const lastSemester = semesters[semesters.length - 1];
  const overallCGPA = lastSemester.cgpa;

  return {
    studentName: null,
    program: null,
    currentGPA: lastSemester.gpa,
    cgpa: overallCGPA,
    totalCredits: semesters.reduce((sum, s) => sum + s.credits, 0),
    semesters,
  };
}

// Confidence scoring
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
    (sum, s) => sum + s.courses.filter((c) => isValidGrade(c.grade)).length,
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

  // GPA/CGPA detection (5% weight - reduced from 10% as bonus signal)
  let gpaDetection = 0;
  if (transcript.currentGPA !== null && transcript.cgpa !== null) gpaDetection = 1.0;
  else if (transcript.currentGPA !== null || transcript.cgpa !== null) gpaDetection = 0.5;

  // Calculate weighted score
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

// Validation stage
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTranscript(transcript: ParsedTranscript): ValidationResult {
  const errors: string[] = [];

  // At least one semester exists
  if (transcript.semesters.length === 0) {
    errors.push("No semesters found");
  }

  // Each course has a course code
  for (const semester of transcript.semesters) {
    for (const course of semester.courses) {
      if (!course.code || course.code.trim().length === 0) {
        errors.push(`Course missing code: ${course.name}`);
      }
    }
  }

  // Each course has a course name
  for (const semester of transcript.semesters) {
    for (const course of semester.courses) {
      if (!course.name || course.name.trim().length === 0) {
        errors.push(`Course missing name: ${course.code}`);
      }
    }
  }

  // Each course has a valid grade
  for (const semester of transcript.semesters) {
    for (const course of semester.courses) {
      if (!isValidGrade(course.grade)) {
        errors.push(`Invalid grade: ${course.code} - ${course.grade}`);
      }
    }
  }

  // Credits are valid if present
  for (const semester of transcript.semesters) {
    for (const course of semester.courses) {
      if (course.credits < 0 || course.credits > 10) {
        errors.push(`Invalid credits: ${course.code} - ${course.credits}`);
      }
    }
  }

  // No obviously duplicated courses (same code in same semester)
  for (const semester of transcript.semesters) {
    const codes = semester.courses.map((c) => c.code);
    const uniqueCodes = new Set(codes);
    if (codes.length !== uniqueCodes.size) {
      errors.push(`Duplicate courses found in semester: ${semester.label}`);
    }
  }

  // No invalid grade values
  for (const semester of transcript.semesters) {
    for (const course of semester.courses) {
      if (!isValidGrade(course.grade)) {
        errors.push(`Invalid grade value: ${course.code} - ${course.grade}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
