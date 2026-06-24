// Unified transcript configuration for grades and enrollment statuses.
// This configuration is shared by both Excel and Text parsers to ensure
// consistent behavior across all input methods.

// --------------------------------------------------------------------------
// GRADE CONFIGURATION
// --------------------------------------------------------------------------

export interface GradeDefinition {
  value: string;
  gpaPoints: number | null;
  passing: boolean;
}

export const GRADE_CONFIG = {
  // English letter grades with GPA points
  englishLetterGrades: new Map<string, GradeDefinition>([
    ["A+", { value: "A+", gpaPoints: 4.0, passing: true }],
    ["A", { value: "A", gpaPoints: 4.0, passing: true }],
    ["A-", { value: "A-", gpaPoints: 3.7, passing: true }],
    ["B+", { value: "B+", gpaPoints: 3.3, passing: true }],
    ["B", { value: "B", gpaPoints: 3.0, passing: true }],
    ["B-", { value: "B-", gpaPoints: 2.7, passing: true }],
    ["C+", { value: "C+", gpaPoints: 2.3, passing: true }],
    ["C", { value: "C", gpaPoints: 2.0, passing: true }],
    ["C-", { value: "C-", gpaPoints: 1.7, passing: true }],
    ["D+", { value: "D+", gpaPoints: 1.3, passing: true }],
    ["D", { value: "D", gpaPoints: 1.0, passing: true }],
    ["D-", { value: "D-", gpaPoints: 0.7, passing: true }],
    ["F", { value: "F", gpaPoints: 0.0, passing: false }],
    ["FA", { value: "FA", gpaPoints: 0.0, passing: false }],
    ["FW", { value: "FW", gpaPoints: 0.0, passing: false }],
    ["FF", { value: "FF", gpaPoints: 0.0, passing: false }],
  ]),

  // English special grades
  englishSpecialGrades: new Map<string, GradeDefinition>([
    // Withdrawal, incomplete, in-progress, non-completed - NOT treated as academic failure
    ["W", { value: "W", gpaPoints: 0.0, passing: true }],
    ["WP", { value: "WP", gpaPoints: 0.0, passing: true }],
    ["WD", { value: "WD", gpaPoints: 0.0, passing: true }],
    ["I", { value: "I", gpaPoints: 0.0, passing: true }],
    ["IP", { value: "IP", gpaPoints: 0.0, passing: true }],
    ["IC", { value: "IC", gpaPoints: 0.0, passing: true }],
    ["NC", { value: "NC", gpaPoints: 0.0, passing: true }],
    // True failing grades
    ["WF", { value: "WF", gpaPoints: 0.0, passing: false }],
    ["NP", { value: "NP", gpaPoints: 0.0, passing: false }],
    ["U", { value: "U", gpaPoints: 0.0, passing: false }],
    // Pass/fail special grades
    ["P", { value: "P", gpaPoints: null, passing: true }],
    ["PASS", { value: "PASS", gpaPoints: null, passing: true }],
    ["CR", { value: "CR", gpaPoints: null, passing: true }],
    ["S", { value: "S", gpaPoints: null, passing: true }],
  ]),

  // Arabic letter grades with GPA points
  arabicLetterGrades: new Map<string, GradeDefinition>([
    ["أ+", { value: "أ+", gpaPoints: 4.0, passing: true }],
    ["أ", { value: "أ", gpaPoints: 4.0, passing: true }],
    ["أ-", { value: "أ-", gpaPoints: 3.7, passing: true }],
    ["ب+", { value: "ب+", gpaPoints: 3.3, passing: true }],
    ["ب", { value: "ب", gpaPoints: 3.0, passing: true }],
    ["ب-", { value: "ب-", gpaPoints: 2.7, passing: true }],
    ["ج+", { value: "ج+", gpaPoints: 2.3, passing: true }],
    ["ج", { value: "ج", gpaPoints: 2.0, passing: true }],
    ["ج-", { value: "ج-", gpaPoints: 1.7, passing: true }],
    ["د+", { value: "د+", gpaPoints: 1.3, passing: true }],
    ["د", { value: "د", gpaPoints: 1.0, passing: true }],
    ["د-", { value: "د-", gpaPoints: 0.7, passing: true }],
  ]),

  // Arabic special grades
  arabicSpecialGrades: new Map<string, GradeDefinition>([
    ["ناجح", { value: "ناجح", gpaPoints: null, passing: true }],
    ["نجاح", { value: "نجاح", gpaPoints: null, passing: true }],
    ["مكتمل", { value: "مكتمل", gpaPoints: null, passing: true }],
    ["اجتاز", { value: "اجتاز", gpaPoints: null, passing: true }],
    ["منسحب", { value: "منسحب", gpaPoints: 0.0, passing: true }],
    ["راسب", { value: "راسب", gpaPoints: 0.0, passing: false }],
    ["رسوب", { value: "رسوب", gpaPoints: 0.0, passing: false }],
    ["ر", { value: "ر", gpaPoints: 0.0, passing: false }],
    ["غ", { value: "غ", gpaPoints: 0.0, passing: false }],
    ["غائب", { value: "غائب", gpaPoints: 0.0, passing: false }],
    ["م", { value: "م", gpaPoints: 0.0, passing: false }],
    ["محروم", { value: "محروم", gpaPoints: 0.0, passing: false }],
    ["ناقص", { value: "ناقص", gpaPoints: 0.0, passing: false }],
    ["إعادة", { value: "إعادة", gpaPoints: 0.0, passing: false }],
  ]),

  // Combined regex patterns for grade detection
  englishGradePattern: /^(A\+?|A-|B\+?|B-|C\+?|C-|D\+?|D-|F[AWF]?|W[FPD]?|I[PC]?|NP|NC|P|S|CR|U|PASS)$/i,
  arabicGradePattern: /^(أ\+?|أ-|ب\+?|ب-|ج\+?|ج-|د\+?|د-|ناجح|نجاح|مكتمل|اجتاز|راسب|رسوب|ر|غ|غائب|م|محروم|منسحب|ناقص|إعادة)$/,

  // Helper functions
  getGradeDefinition(grade: string): GradeDefinition | null {
    const trimmed = grade.trim();
    const upper = trimmed.toUpperCase();

    // Check English letter grades
    const englishLetter = this.englishLetterGrades.get(upper);
    if (englishLetter) return englishLetter;

    // Check English special grades
    const englishSpecial = this.englishSpecialGrades.get(upper);
    if (englishSpecial) return englishSpecial;

    // Check Arabic letter grades
    const arabicLetter = this.arabicLetterGrades.get(trimmed);
    if (arabicLetter) return arabicLetter;

    // Check Arabic special grades
    const arabicSpecial = this.arabicSpecialGrades.get(trimmed);
    if (arabicSpecial) return arabicSpecial;

    return null;
  },

  isValidGrade(grade: string): boolean {
    const trimmed = grade.trim();
    return this.englishGradePattern.test(trimmed) || this.arabicGradePattern.test(trimmed);
  },

  isPassingGrade(grade: string): boolean {
    const def = this.getGradeDefinition(grade);
    return def ? def.passing : false;
  },

  gradeToPoints(grade: string): number | null {
    const def = this.getGradeDefinition(grade);
    return def ? def.gpaPoints : null;
  },
};

// --------------------------------------------------------------------------
// ENROLLMENT STATUS CONFIGURATION
// --------------------------------------------------------------------------

export interface StatusDefinition {
  pattern: RegExp;
  value: string;
  enrolled: boolean;
}

export const STATUS_CONFIG = {
  // English enrolled statuses
  englishEnrolledStatuses: [
    { pattern: /\benrolled\b/i, value: "Enrolled", enrolled: true },
    { pattern: /\bactive\b/i, value: "Enrolled", enrolled: true },
    { pattern: /\bin good standing\b/i, value: "Enrolled", enrolled: true },
    { pattern: /\bprobation\b/i, value: "Enrolled", enrolled: true },
    { pattern: /\bwarning\b/i, value: "Enrolled", enrolled: true },
    { pattern: /\bacademic warning\b/i, value: "Enrolled", enrolled: true },
  ],

  // English non-enrolled statuses
  englishNonEnrolledStatuses: [
    { pattern: /\bwithdrawn\b/i, value: "Withdrawn", enrolled: false },
    { pattern: /\bwithdraw\b/i, value: "Withdrawn", enrolled: false },
    { pattern: /\bw\b/i, value: "Withdrawn", enrolled: false },
    { pattern: /\bwithdrawal\b/i, value: "Withdrawn", enrolled: false },
    { pattern: /\bunofficial withdrawal\b/i, value: "Withdrawn", enrolled: false },
    { pattern: /\bofficial withdrawal\b/i, value: "Withdrawn", enrolled: false },
    { pattern: /\bdeferred\b/i, value: "Deferred", enrolled: false },
    { pattern: /\bpostponed\b/i, value: "Deferred", enrolled: false },
    { pattern: /\bdelayed\b/i, value: "Deferred", enrolled: false },
    { pattern: /\bdismissed\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\bexpelled\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\bterminated\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\bdisciplinary dismissal\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\bsuspended\b/i, value: "Suspended", enrolled: false },
    { pattern: /\bon suspension\b/i, value: "Suspended", enrolled: false },
    { pattern: /\bregistration suspension\b/i, value: "Suspended", enrolled: false },
    { pattern: /\benrollment suspension\b/i, value: "Suspended", enrolled: false },
    { pattern: /\bdisciplinary suspension\b/i, value: "Suspended", enrolled: false },
    { pattern: /\bleave of absence\b/i, value: "Leave of Absence", enrolled: false },
    { pattern: /\bacademic leave\b/i, value: "Leave of Absence", enrolled: false },
    { pattern: /\bstudy leave\b/i, value: "Study Leave", enrolled: false },
    { pattern: /\bsemester leave\b/i, value: "Leave of Absence", enrolled: false },
    { pattern: /\bleave of study\b/i, value: "Leave of Absence", enrolled: false },
    // Keyword variants for Excel compatibility
    { pattern: /\bdismiss\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\bsuspend\b/i, value: "Suspended", enrolled: false },
    { pattern: /\bexpel\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\bdiscontinu\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\bterminat\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\binactive\b/i, value: "Dismissed", enrolled: false },
    { pattern: /\bdefer\b/i, value: "Deferred", enrolled: false },
    { pattern: /\bpostpone\b/i, value: "Deferred", enrolled: false },
  ],

  // Arabic enrolled statuses
  arabicEnrolledStatuses: [
    { pattern: /(مقيد|مسجل|مُسجَّل|منتظم|مستمر|قيد\s*الدراسة|منذر|إنذار)/, value: "مقيد", enrolled: true },
  ],

  // Arabic non-enrolled statuses
  arabicNonEnrolledStatuses: [
    { pattern: /(منسحب|انسحاب)/, value: "منسحب", enrolled: false },
    { pattern: /(مؤجل|تأجيل)/, value: "مؤجل", enrolled: false },
    { pattern: /(موقوف|إيقاف|إيقاف\s*قيد)/, value: "موقوف", enrolled: false },
    { pattern: /(منقطع|انقطاع)/, value: "منقطع", enrolled: false },
    { pattern: /(انقطاع عن الدراسة|انقطاع عن فصل دراسي)/, value: "منقطع", enrolled: false },
    { pattern: /(معتذر|اعتذار)/, value: "معتذر", enrolled: false },
    { pattern: /(معتذر عن فصل|معتذر عن فصول|اعتذار عن الدراسة|اعتذار عن فصل دراسي)/, value: "معتذر", enrolled: false },
    { pattern: /(مفصول|فصل)/, value: "مفصول", enrolled: false },
    { pattern: /(فصل نهائي|فصل نهائي من الجامعة|فصل تأديبي)/, value: "مفصول", enrolled: false },
    { pattern: /(محروم|منتهي\s*القيد|طي\s*القيد)/, value: "مفصول", enrolled: false },
    { pattern: /(غير\s*(مقيد|منتظم|مسجل))/, value: "غير مقيد", enrolled: false },
  ],

  // Helper functions
  extractStatus(line: string): string | null {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // Check English enrolled statuses
    for (const status of this.englishEnrolledStatuses) {
      if (status.pattern.test(lower)) {
        return status.value;
      }
    }

    // Check English non-enrolled statuses
    for (const status of this.englishNonEnrolledStatuses) {
      if (status.pattern.test(lower)) {
        return status.value;
      }
    }

    // Check Arabic enrolled statuses
    for (const status of this.arabicEnrolledStatuses) {
      if (status.pattern.test(trimmed)) {
        return status.value;
      }
    }

    // Check Arabic non-enrolled statuses
    for (const status of this.arabicNonEnrolledStatuses) {
      if (status.pattern.test(trimmed)) {
        return status.value;
      }
    }

    return null;
  },

  isEnrolledStatus(status: string | undefined | null): boolean {
    if (status == null) return true; // default to enrolled when missing
    const raw = String(status).trim();
    if (raw === "") return true;

    // Check English enrolled statuses
    for (const status of this.englishEnrolledStatuses) {
      if (status.pattern.test(raw.toLowerCase())) {
        return true;
      }
    }

    // Check Arabic enrolled statuses
    for (const status of this.arabicEnrolledStatuses) {
      if (status.pattern.test(raw)) {
        return true;
      }
    }

    // Arabic negation: explicit "غير مقيد" / "غير منتظم" is NOT enrolled
    if (/غير\s*(مقيد|منتظم|مسجل)/.test(raw)) return false;

    return false;
  },

  // Status strength for Excel parser (higher = more authoritative)
  statusStrength(s: string | null | undefined): number {
    if (!s) return 0;
    const raw = String(s).trim();
    if (!raw) return 0;
    const lower = raw.toLowerCase();

    // Check English non-enrolled statuses
    for (const status of this.englishNonEnrolledStatuses) {
      if (status.pattern.test(lower)) {
        return 3;
      }
    }

    // Check Arabic non-enrolled statuses
    for (const status of this.arabicNonEnrolledStatuses) {
      if (status.pattern.test(raw)) {
        return 3;
      }
    }

    // Check English enrolled statuses
    for (const status of this.englishEnrolledStatuses) {
      if (status.pattern.test(lower)) {
        return 1;
      }
    }

    // Check Arabic enrolled statuses
    for (const status of this.arabicEnrolledStatuses) {
      if (status.pattern.test(raw)) {
        return 1;
      }
    }

    // Unknown but non-empty
    return 2;
  },
};
