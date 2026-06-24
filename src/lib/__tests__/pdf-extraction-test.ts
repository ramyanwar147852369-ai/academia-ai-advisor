// PDF extraction test utility.
// This file provides functions to test PDF text extraction quality.
// Run this in a browser console or Node.js environment to validate extraction.

import {
  extractTextFromPDF,
  extractTextWithLayout,
  detectPDFType,
  looksLikeTranscript,
  type PDFTextContent,
} from "../pdf-text-extractor";

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
// Test Functions
// --------------------------------------------------------------------------

/**
 * Tests basic text extraction from a PDF buffer.
 */
export async function testBasicExtraction(buffer: ArrayBuffer): Promise<TestResult> {
  try {
    const pages = await extractTextFromPDF(buffer);
    
    if (pages.length === 0) {
      return {
        testName: "Basic Text Extraction",
        passed: false,
        message: "No pages extracted from PDF",
        details: { pageCount: pages.length },
      };
    }
    
    const totalText = pages.join("\n").length;
    if (totalText === 0) {
      return {
        testName: "Basic Text Extraction",
        passed: false,
        message: "PDF has pages but no text content",
        details: { pageCount: pages.length, totalText },
      };
    }
    
    return {
      testName: "Basic Text Extraction",
      passed: true,
      message: `Successfully extracted text from ${pages.length} pages`,
      details: { pageCount: pages.length, totalText },
    };
  } catch (error) {
    return {
      testName: "Basic Text Extraction",
      passed: false,
      message: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Tests layout-aware text extraction.
 */
export async function testLayoutExtraction(buffer: ArrayBuffer): Promise<TestResult> {
  try {
    const content = await extractTextWithLayout(buffer);
    
    if (content.pages.length === 0) {
      return {
        testName: "Layout Extraction",
        passed: false,
        message: "No pages extracted with layout",
        details: { pageCount: content.pages.length },
      };
    }
    
    const hasItems = content.pages.some(page => page.items.length > 0);
    if (!hasItems) {
      return {
        testName: "Layout Extraction",
        passed: false,
        message: "No text items found in any page",
        details: { pageCount: content.pages.length },
      };
    }
    
    return {
      testName: "Layout Extraction",
      passed: true,
      message: `Successfully extracted layout from ${content.pages.length} pages`,
      details: {
        pageCount: content.pages.length,
        totalItems: content.pages.reduce((sum, p) => sum + p.items.length, 0),
        quality: content.quality,
      },
    };
  } catch (error) {
    return {
      testName: "Layout Extraction",
      passed: false,
      message: `Layout extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Tests PDF type detection.
 */
export async function testPDFTypeDetection(buffer: ArrayBuffer): Promise<TestResult> {
  try {
    const type = await detectPDFType(buffer);
    
    if (type === "unknown") {
      return {
        testName: "PDF Type Detection",
        passed: true,
        message: "PDF type detected as unknown (may be empty or corrupted)",
        details: { type },
      };
    }
    
    return {
      testName: "PDF Type Detection",
      passed: true,
      message: `PDF type detected: ${type}`,
      details: { type },
    };
  } catch (error) {
    return {
      testName: "PDF Type Detection",
      passed: false,
      message: `Type detection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Tests extraction quality assessment.
 */
export async function testExtractionQuality(buffer: ArrayBuffer): Promise<TestResult> {
  try {
    const content = await extractTextWithLayout(buffer);
    const quality = content.quality;
    
    if (quality.score < 0.3) {
      return {
        testName: "Extraction Quality",
        passed: false,
        message: "Low extraction quality detected",
        details: { quality },
      };
    }
    
    if (quality.issues.length > 0) {
      return {
        testName: "Extraction Quality",
        passed: true,
        message: `Quality acceptable with ${quality.issues.length} issues`,
        details: { quality },
      };
    }
    
    return {
      testName: "Extraction Quality",
      passed: true,
      message: `Good extraction quality (score: ${quality.score.toFixed(2)})`,
      details: { quality },
    };
  } catch (error) {
    return {
      testName: "Extraction Quality",
      passed: false,
      message: `Quality assessment failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Tests transcript content detection.
 */
export async function testTranscriptDetection(buffer: ArrayBuffer): Promise<TestResult> {
  try {
    const content = await extractTextWithLayout(buffer);
    const isTranscript = looksLikeTranscript(content);
    
    return {
      testName: "Transcript Detection",
      passed: true,
      message: isTranscript ? "Content appears to be a transcript" : "Content does not appear to be a transcript",
      details: { isTranscript, textLength: content.fullText.length },
    };
  } catch (error) {
    return {
      testName: "Transcript Detection",
      passed: false,
      message: `Transcript detection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// --------------------------------------------------------------------------
// Test Suite Runner
// --------------------------------------------------------------------------

/**
 * Runs all PDF extraction tests on a given PDF buffer.
 */
export async function runPDFExtractionTests(buffer: ArrayBuffer): Promise<TestSuite> {
  const results: TestResult[] = [];
  
  results.push(await testBasicExtraction(buffer));
  results.push(await testLayoutExtraction(buffer));
  results.push(await testPDFTypeDetection(buffer));
  results.push(await testExtractionQuality(buffer));
  results.push(await testTranscriptDetection(buffer));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  return {
    name: "PDF Extraction Test Suite",
    results,
    summary: {
      total: results.length,
      passed,
      failed,
    },
  };
}

/**
 * Formats test results for console output.
 */
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

// --------------------------------------------------------------------------
// Browser Test Helper
// --------------------------------------------------------------------------

/**
 * Helper function to run tests from a file input in the browser.
 * Call this from browser console after selecting a PDF file.
 */
export async function testPDFFromFile(file: File): Promise<TestSuite> {
  const buffer = await file.arrayBuffer();
  return runPDFExtractionTests(buffer);
}

/**
 * Logs test results to console in a formatted way.
 */
export function logTestResults(suite: TestSuite): void {
  console.log(formatTestResults(suite));
}
