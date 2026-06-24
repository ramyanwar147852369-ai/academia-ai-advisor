# PDF Parser Parsing Rules Documentation

## Overview
This document tracks all parsing rules used in the PDF transcript parser and their source.

## Rule Classification

### Reused from Excel Parser (Direct Copy)

**1. Arabic Digit Normalization**
- **Function:** `arabicDigitsToAscii()`
- **Source:** excel-transcript.ts lines 45-48
- **Purpose:** Convert Arabic-Indic digits (٠-٩) and Persian digits (۰-۹) to ASCII digits (0-9)
- **No changes made**

**2. Text Normalization**
- **Function:** `norm()`
- **Source:** excel-transcript.ts lines 50-51
- **Purpose:** Normalize whitespace and trim strings
- **No changes made**

**3. Number Parsing**
- **Function:** `toNumber()`
- **Source:** excel-transcript.ts lines 53-61
- **Purpose:** Parse numbers with Arabic digit support and handle comma/decimal separators
- **No changes made**

**4. Grade Cleaning**
- **Function:** `cleanGradeToken()`
- **Source:** excel-transcript.ts lines 63-65
- **Purpose:** Remove whitespace and uppercase grade tokens
- **No changes made**

**5. Pass/Fail Inference**
- **Function:** `inferPassed()`
- **Source:** excel-transcript.ts lines 67-69
- **Purpose:** Determine if a grade is passing using GRADE_CONFIG
- **No changes made**

**6. Grade Points Calculation**
- **Function:** `gradePointsFor()`
- **Source:** excel-transcript.ts lines 71-73
- **Purpose:** Calculate GPA points for a grade using GRADE_CONFIG
- **No changes made**

**7. Letter Grade Detection**
- **Function:** `isGradeCell()`
- **Source:** excel-transcript.ts lines 75-87
- **Purpose:** Detect if a cell contains a valid grade using GRADE_CONFIG patterns
- **No changes made**

**8. Course Code Detection**
- **Function:** `isCourseCode()`
- **Source:** excel-transcript.ts lines 89-102
- **Purpose:** Detect valid course codes using regex pattern
- **Pattern:** `/^[A-Za-z\u0600-\u06FF\-]{2,6}[\s\-_.]*\d{2,5}[A-Za-z]?$/`
- **No changes made**

**9. Semester Header Detection**
- **Function:** `detectSemesterHeader()`
- **Source:** excel-transcript.ts lines 104-135
- **Purpose:** Detect semester headers with term type and academic year
- **No changes made**

**10. Academic Year Extraction**
- **Function:** `extractAcademicYear()`
- **Source:** excel-transcript.ts lines 116-120
- **Purpose:** Extract 4-digit year from text
- **No changes made**

**11. Term Keywords**
- **Constant:** `TERM_KEYWORDS`
- **Source:** excel-transcript.ts lines 109-114
- **Purpose:** Regex patterns for term type detection (fall, spring, summer, winter)
- **No changes made**

**12. GPA/CGPA Detection**
- **Function:** `detectGpaFromLine()`
- **Source:** excel-transcript.ts lines 138-176 (adapted for line-based parsing)
- **Purpose:** Detect GPA and CGPA values from text lines
- **Changes:** Adapted from cell-based to line-based parsing (splits line by whitespace instead of iterating cells)

**13. Status Detection**
- **Function:** `detectStatusFromLine()`
- **Source:** excel-transcript.ts lines 186-206 (adapted for line-based parsing)
- **Purpose:** Detect enrollment status from text lines
- **Changes:** Adapted from cell-based to line-based parsing; added STATUS_CONFIG.extractStatus() fallback

**14. Semester Value to Term Conversion**
- **Function:** `semesterValueToTerm()`
- **Source:** excel-transcript.ts lines 440-455
- **Purpose:** Convert semester value to term type and label
- **No changes made**

**15. Status Strength**
- **Function:** `statusStrength()`
- **Source:** excel-transcript.ts lines 396-398
- **Purpose:** Get status strength from STATUS_CONFIG
- **No changes made**

### Reused from Text Parser (Adapted)

**16. Line Splitting**
- **Function:** `splitLine()`
- **Source:** text-transcript-parser.ts lines 124-133
- **Purpose:** Split lines by common delimiters (pipe, comma, tab, space)
- **No changes made**

**17. Course Code Line Detection**
- **Function:** `looksLikeCourseCode()`
- **Source:** text-transcript-parser.ts lines 136-156
- **Purpose:** Check if a line starts with a valid course code
- **Changes:** Uses Excel Parser's `isCourseCode()` instead of Text Parser's `COURSE_CODE_PATTERNS`

**18. Course Line Parsing**
- **Function:** `parseCourseLine()`
- **Source:** text-transcript-parser.ts lines 164-273
- **Purpose:** Parse a single course line into structured data
- **Changes:** 
  - Uses Excel Parser's `isCourseCode()` for detection
  - Uses GRADE_CONFIG.isValidGrade() instead of Text Parser's isValidGrade()
  - Uses Excel Parser's `toNumber()` for credit parsing
  - Uses Excel Parser's `gradePointsFor()` and `inferPassed()`

### Reused from Centralized Configuration

**19. Grade Configuration**
- **Source:** transcript-config.ts
- **Usage:**
  - `GRADE_CONFIG.englishGradePattern` - For letter grade detection
  - `GRADE_CONFIG.arabicGradePattern` - For Arabic grade detection
  - `GRADE_CONFIG.isValidGrade()` - For grade validation
  - `GRADE_CONFIG.isPassingGrade()` - For pass/fail inference
  - `GRADE_CONFIG.gradeToPoints()` - For GPA point calculation
- **No changes made**

**20. Status Configuration**
- **Source:** transcript-config.ts
- **Usage:**
  - `STATUS_CONFIG.extractStatus()` - For status extraction
  - `STATUS_CONFIG.statusStrength()` - For status strength calculation
- **No changes made**

### PDF-Specific Rules (Newly Introduced)

**21. Multi-Page Text Aggregation**
- **Location:** parsePDFTranscript() function
- **Purpose:** Combine text from all PDF pages into a single stream for parsing
- **Reason:** PDF extraction returns page-by-page content; need to aggregate for semester detection across page boundaries
- **Implementation:** `const fullText = content.fullText;` - uses fullText from PDFTextContent

**22. Line-Based Semester Detection**
- **Location:** parsePDFTranscript() function
- **Purpose:** Detect semester headers in line-based text (vs cell-based in Excel)
- **Reason:** PDF-extracted text is line-based, not cell-based
- **Implementation:** Calls `detectSemesterHeader(line)` on each line
- **Note:** Uses Excel Parser's semester detection logic but applies it line-by-line

**23. Line-Based GPA/CGPA Detection**
- **Location:** parsePDFTranscript() function
- **Purpose:** Detect GPA/CGPA values in line-based text
- **Reason:** PDF-extracted text is line-based, not cell-based
- **Implementation:** Calls `detectGpaFromLine(line)` on each line
- **Note:** Adapted from Excel Parser's cell-based detection

**24. Line-Based Status Detection**
- **Location:** parsePDFTranscript() function
- **Purpose:** Detect enrollment status in line-based text
- **Reason:** PDF-extracted text is line-based, not cell-based
- **Implementation:** Calls `detectStatusFromLine(line)` on each line
- **Note:** Adapted from Excel Parser's cell-based detection

**25. Default Semester Creation**
- **Location:** parsePDFTranscript() function
- **Purpose:** Create a default semester when no header is found
- **Reason:** PDF transcripts may not have explicit semester headers
- **Implementation:** Creates semester with label "Unknown Semester" and termType "other"
- **Note:** Similar to Text Parser's default semester creation

## Summary

- **Total Rules:** 25
- **Reused from Excel Parser:** 15 (60%)
- **Reused from Text Parser:** 3 (12%)
- **Reused from Centralized Config:** 2 (8%)
- **PDF-Specific:** 5 (20%)

**Key Insight:** The PDF parser is primarily built on Excel Parser logic (60%) with Text Parser adaptations for line-based parsing (12%). Only 20% of rules are PDF-specific, mostly related to adapting cell-based Excel logic to line-based PDF text.

## No Third Independent Pattern Set

As required, **no third independent set of course-code recognition patterns** was created. The PDF parser uses Excel Parser's `isCourseCode()` function and `COURSE_CODE_RE` pattern exclusively.

## No Separate Grade/Status Lists

As required, **no separate grade lists, status lists, warning rules, dismissal rules, or retake rules** were created. The PDF parser uses the centralized `GRADE_CONFIG` and `STATUS_CONFIG` from `transcript-config.ts`.

## Consistency with Excel Parser

The PDF parser produces the exact same output structure as the Excel Parser:
- Same `ParsedTranscript` type
- Same `ParsedSemester` type
- Same `ParsedCourse` type
- Same field names and types
- Same downstream behavior for failed course detection, retake detection, risk assessment, warning calculations, and academic analysis
