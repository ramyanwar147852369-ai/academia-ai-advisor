// PDF parser test suite.
// Tests the deterministic PDF transcript parser against mock data.
// Validates consistency with Excel Parser output structure.

import {
  parsePDFTranscript,
  calculateConfidence,
  validateTranscript,
  type ParsedTranscript,
  type ConfidenceScore,
  type ValidationResult,
} from "../pdf-transcript-parser";
import type { PDFTextContent } from "../pdf-text-extractor";

export interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  details?: any;
}

export interface TestSuite {
  name: string;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

// --------------------------------------------------------------------------
// Mock Data
// --------------------------------------------------------------------------

function createMockPDFTextContent(text: string): PDFTextContent {
  return {
    pages: [
      {
        pageNumber: 1,
        text,
        items: [{ str: text }],
        hasTextLayer: true,
      },
    ],
    fullText: text,
    totalPages: 1,
    type: "digital",
    quality: {
      score: 0.9,
      hasTextLayer: true,
      textDensity: 100,
      averageItemLength: 5,
      issues: [],
    },
  };
}

// Mock transcript with English content
const mockEnglishTranscript = `Fall 2023
CIS113 Introduction to Computing 3 A
MATH101 Calculus I 3 B+
ENG101 English Composition 3 A
GPA 3.5
Spring 2024
CIS114 Programming II 3 A-
MATH102 Calculus II 3 B
PHY101 Physics I 3 A
GPA 3.3`;

// Mock transcript with Arabic content
const mockArabicTranscript = `خريف 2023
CIS113 مقدمة في الحوسبة 3 أ
MATH101 التفاضل والتكامل 1 3 ب+
ENG101 التركيب الإنجليزي 3 أ
معدل الفصل 3.5
ربيع 2024
CIS114 البرمجة 2 3 أ-
MATH102 التفاضل والتكامل 2 3 ب
PHY101 الفيزياء 1 3 أ
معدل الفصل 3.3`;

// Mock transcript with mixed content
const mockMixedTranscript = `Fall 2023 خريف
CIS113 Introduction to Computing 3 A
MATH101 Calculus I 3 B+
GPA 3.5 معدل الفصل
Spring 2024 ربيع
CIS114 Programming II 3 A-
GPA 3.3`;

// Mock transcript with special course codes
const mockSpecialCodesTranscript = `Fall 2023
HUMX76 Humanities 3 A
HUMX73 Ethics 3 B+
---291 Redacted Course 3 I
---391 Another Redacted 3 W
GPA 2.5`;

// Mock transcript with status
const mockStatusTranscript = `Fall 2023
CIS113 Introduction to Computing 3 A
MATH101 Calculus I 3 B+
Status: Enrolled
GPA 3.5`;

// --------------------------------------------------------------------------
// Test Functions
// --------------------------------------------------------------------------

export async function testBasicParsing(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockEnglishTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Basic Parsing",
        passed: false,
        message: "Parser returned null",
      };
    }
    
    if (transcript.semesters.length === 0) {
      return {
        testName: "Basic Parsing",
        passed: false,
        message: "No semesters parsed",
        details: { transcript },
      };
    }
    
    return {
      testName: "Basic Parsing",
      passed: true,
      message: `Successfully parsed ${transcript.semesters.length} semesters`,
      details: { semesterCount: transcript.semesters.length },
    };
  } catch (error) {
    return {
      testName: "Basic Parsing",
      passed: false,
      message: `Parsing failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testCourseExtraction(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockEnglishTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Course Extraction",
        passed: false,
        message: "Parser returned null",
      };
    }
    
    const totalCourses = transcript.semesters.reduce((sum, s) => sum + s.courses.length, 0);
    
    if (totalCourses === 0) {
      return {
        testName: "Course Extraction",
        passed: false,
        message: "No courses extracted",
        details: { transcript },
      };
    }
    
    return {
      testName: "Course Extraction",
      passed: true,
      message: `Successfully extracted ${totalCourses} courses`,
      details: { totalCourses },
    };
  } catch (error) {
    return {
      testName: "Course Extraction",
      passed: false,
      message: `Course extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testGradeExtraction(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockEnglishTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Grade Extraction",
        passed: false,
        message: "Parser returned null",
      };
    }
    
    let coursesWithGrades = 0;
    for (const semester of transcript.semesters) {
      for (const course of semester.courses) {
        if (course.grade && course.grade !== "Unknown") {
          coursesWithGrades++;
        }
      }
    }
    
    if (coursesWithGrades === 0) {
      return {
        testName: "Grade Extraction",
        passed: false,
        message: "No grades extracted",
        details: { transcript },
      };
    }
    
    return {
      testName: "Grade Extraction",
      passed: true,
      message: `Successfully extracted grades for ${coursesWithGrades} courses`,
      details: { coursesWithGrades },
    };
  } catch (error) {
    return {
      testName: "Grade Extraction",
      passed: false,
      message: `Grade extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testArabicSupport(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockArabicTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Arabic Support",
        passed: false,
        message: "Parser returned null for Arabic transcript",
      };
    }
    
    if (transcript.semesters.length === 0) {
      return {
        testName: "Arabic Support",
        passed: false,
        message: "No semesters parsed from Arabic transcript",
      };
    }
    
    return {
      testName: "Arabic Support",
      passed: true,
      message: "Successfully parsed Arabic transcript",
      details: { semesterCount: transcript.semesters.length },
    };
  } catch (error) {
    return {
      testName: "Arabic Support",
      passed: false,
      message: `Arabic parsing failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testMixedContent(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockMixedTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Mixed Content Support",
        passed: false,
        message: "Parser returned null for mixed content",
      };
    }
    
    if (transcript.semesters.length === 0) {
      return {
        testName: "Mixed Content Support",
        passed: false,
        message: "No semesters parsed from mixed content",
      };
    }
    
    return {
      testName: "Mixed Content Support",
      passed: true,
      message: "Successfully parsed mixed Arabic/English content",
      details: { semesterCount: transcript.semesters.length },
    };
  } catch (error) {
    return {
      testName: "Mixed Content Support",
      passed: false,
      message: `Mixed content parsing failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testSpecialCourseCodes(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockSpecialCodesTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Special Course Codes",
        passed: false,
        message: "Parser returned null",
      };
    }
    
    const allCodes = transcript.semesters.flatMap(s => s.courses.map(c => c.code));
    const hasHUMX76 = allCodes.includes("HUMX76");
    const hasHUMX73 = allCodes.includes("HUMX73");
    const hasDash291 = allCodes.includes("---291");
    const hasDash391 = allCodes.includes("---391");
    
    if (!hasHUMX76 || !hasHUMX73 || !hasDash291 || !hasDash391) {
      return {
        testName: "Special Course Codes",
        passed: false,
        message: "Special course codes not detected",
        details: { allCodes, hasHUMX76, hasHUMX73, hasDash291, hasDash391 },
      };
    }
    
    return {
      testName: "Special Course Codes",
      passed: true,
      message: "All special course codes detected correctly",
      details: { allCodes },
    };
  } catch (error) {
    return {
      testName: "Special Course Codes",
      passed: false,
      message: `Special course code parsing failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testConfidenceScoring(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockEnglishTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Confidence Scoring",
        passed: false,
        message: "Parser returned null",
      };
    }
    
    const confidence = calculateConfidence(transcript);
    
    if (confidence.score < 0 || confidence.score > 1) {
      return {
        testName: "Confidence Scoring",
        passed: false,
        message: `Confidence score out of range: ${confidence.score}`,
        details: { confidence },
      };
    }
    
    return {
      testName: "Confidence Scoring",
      passed: true,
      message: `Confidence score calculated: ${confidence.score.toFixed(2)}`,
      details: { confidence },
    };
  } catch (error) {
    return {
      testName: "Confidence Scoring",
      passed: false,
      message: `Confidence scoring failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testValidation(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockEnglishTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Validation",
        passed: false,
        message: "Parser returned null",
      };
    }
    
    const validation = validateTranscript(transcript);
    
    if (!validation.valid && validation.errors.length > 0) {
      return {
        testName: "Validation",
        passed: false,
        message: "Validation failed",
        details: { validation },
      };
    }
    
    return {
      testName: "Validation",
      passed: true,
      message: "Transcript validation passed",
      details: { validation },
    };
  } catch (error) {
    return {
      testName: "Validation",
      passed: false,
      message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function testOutputStructure(): Promise<TestResult> {
  try {
    const content = createMockPDFTextContent(mockEnglishTranscript);
    const transcript = parsePDFTranscript(content);
    
    if (!transcript) {
      return {
        testName: "Output Structure",
        passed: false,
        message: "Parser returned null",
      };
    }
    
    // Check structure matches Excel Parser output
    const hasStudentName = "studentName" in transcript;
    const hasProgram = "program" in transcript;
    const hasCurrentGPA = "currentGPA" in transcript;
    const hasCGPA = "cgpa" in transcript;
    const hasTotalCredits = "totalCredits" in transcript;
    const hasSemesters = "semesters" in transcript && Array.isArray(transcript.semesters);
    
    if (!hasStudentName || !hasProgram || !hasCurrentGPA || !hasCGPA || !hasTotalCredits || !hasSemesters) {
      return {
        testName: "Output Structure",
        passed: false,
        message: "Output structure does not match Excel Parser",
        details: { hasStudentName, hasProgram, hasCurrentGPA, hasCGPA, hasTotalCredits, hasSemesters },
      };
    }
    
    // Check semester structure
    if (transcript.semesters.length > 0) {
      const semester = transcript.semesters[0];
      const hasSemesterFields = 
        "label" in semester &&
        "termType" in semester &&
        "status" in semester &&
        "gpa" in semester &&
        "cgpa" in semester &&
        "credits" in semester &&
        "courses" in semester &&
        Array.isArray(semester.courses);
      
      if (!hasSemesterFields) {
        return {
          testName: "Output Structure",
          passed: false,
          message: "Semester structure does not match Excel Parser",
          details: { semester },
        };
      }
      
      // Check course structure
      if (semester.courses.length > 0) {
        const course = semester.courses[0];
        const hasCourseFields =
          "code" in course &&
          "name" in course &&
          "credits" in course &&
          "grade" in course &&
          "gradePoints" in course &&
          "passed" in course;
        
        if (!hasCourseFields) {
          return {
            testName: "Output Structure",
            passed: false,
            message: "Course structure does not match Excel Parser",
            details: { course },
          };
        }
      }
    }
    
    return {
      testName: "Output Structure",
      passed: true,
      message: "Output structure matches Excel Parser",
    };
  } catch (error) {
    return {
      testName: "Output Structure",
      passed: false,
      message: `Structure validation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// --------------------------------------------------------------------------
// Test Suite Runner
// --------------------------------------------------------------------------

export async function runPDFParserTests(): Promise<TestSuite> {
  const results: TestResult[] = [];
  
  results.push(await testBasicParsing());
  results.push(await testCourseExtraction());
  results.push(await testGradeExtraction());
  results.push(await testArabicSupport());
  results.push(await testMixedContent());
  results.push(await testSpecialCourseCodes());
  results.push(await testConfidenceScoring());
  results.push(await testValidation());
  results.push(await testOutputStructure());
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  return {
    name: "PDF Parser Test Suite",
    results,
    summary: {
      total: results.length,
      passed,
      failed,
    },
  };
}

export function formatTestResults(suite: TestSuite): string {
  let output = `\n=== ${suite.name} ===\n`;
  output += `Total: ${suite.summary.total} | Passed: ${suite.summary.passed} | Failed: ${suite.summary.failed}\n\n`;
  
  for (const result of suite.results) {
    const status = result.passed ? "✓ PASS" : "✗ FAIL";
    output += `${status}: ${result.testName}\n`;
    output += `  ${result.message}\n`;
    if (result.details) {
      output += `  Details: ${JSON.stringify(result.details, null, 2)}\n`;
    }
    output += "\n";
  }
  
  return output;
}

// Export for use in other contexts (run tests manually)
export async function getTestResults() {
  return await runPDFParserTests();
}

export function getFormattedResults(suite: TestSuite) {
  return formatTestResults(suite);
}
