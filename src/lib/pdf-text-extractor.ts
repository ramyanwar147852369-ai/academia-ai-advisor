// PDF text extraction layer using pdfjs-dist (Mozilla PDF.js).
// This module provides the foundation for deterministic PDF transcript parsing.
// Phase 1: Extraction infrastructure only - no parsing logic yet.

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure PDF.js worker to use bundled local version
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// --------------------------------------------------------------------------
// Type Definitions
// --------------------------------------------------------------------------

export type PDFType = "digital" | "scanned" | "mixed" | "unknown";

export interface PDFTextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
  dir?: string;
  fontName?: string;
}

export interface PDFPageContent {
  pageNumber: number;
  text: string;
  items: PDFTextItem[];
  hasTextLayer: boolean;
}

export interface PDFTextContent {
  pages: PDFPageContent[];
  fullText: string;
  totalPages: number;
  type: PDFType;
  quality: ExtractionQuality;
}

export interface ExtractionQuality {
  score: number; // 0-1
  hasTextLayer: boolean;
  textDensity: number; // characters per page
  averageItemLength: number;
  issues: string[];
}

// --------------------------------------------------------------------------
// PDF Type Detection
// --------------------------------------------------------------------------

/**
 * Detects the type of PDF based on text layer presence and quality.
 * @param buffer - PDF file as ArrayBuffer
 * @returns Promise<PDFType> - Type of PDF
 */
export async function detectPDFType(buffer: ArrayBuffer): Promise<PDFType> {
  try {
    console.log("[detectPDFType] Starting, buffer byteLength:", buffer.byteLength);
    // Wrap buffer in Uint8Array to prevent PDF.js from transferring ownership
    const data = new Uint8Array(buffer.slice(0));
    console.log("[detectPDFType] Created Uint8Array copy, byteLength:", data.byteLength);
    console.log("[detectPDFType] Original buffer byteLength before getDocument:", buffer.byteLength);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    console.log("[detectPDFType] PDF document loaded");
    console.log("[detectPDFType] Original buffer byteLength after getDocument:", buffer.byteLength);
    
    // Check first few pages for text layer
    const pagesToCheck = Math.min(3, pdf.numPages);
    let pagesWithText = 0;
    let pagesWithImages = 0;
    
    for (let i = 1; i <= pagesToCheck; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      if (textContent.items.length > 0) {
        pagesWithText++;
      }
      
      // Check for operator statistics (indicates images/scanned content)
      const ops = await page.getOperatorList();
      if (ops.fnArray && ops.fnArray.length > 0) {
        // Simple heuristic: if there are many operators but little text, likely scanned
        if (textContent.items.length < 10 && ops.fnArray.length > 100) {
          pagesWithImages++;
        }
      }
    }
    
    await pdf.destroy();
    console.log("[detectPDFType] PDF destroyed");
    console.log("[detectPDFType] Original buffer byteLength after destroy:", buffer.byteLength);
    
    // Determine type based on analysis
    if (pagesWithText === pagesToCheck && pagesWithImages === 0) {
      return "digital";
    } else if (pagesWithText === 0 && pagesWithImages > 0) {
      return "scanned";
    } else if (pagesWithText > 0 && pagesWithImages > 0) {
      return "mixed";
    } else {
      return "unknown";
    }
  } catch (error) {
    console.error("Error detecting PDF type:", error);
    return "unknown";
  }
}

// --------------------------------------------------------------------------
// Basic Text Extraction
// --------------------------------------------------------------------------

/**
 * Extracts plain text from PDF, one page at a time.
 * @param buffer - PDF file as ArrayBuffer
 * @returns Promise<string[]> - Array of text strings, one per page
 */
export async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string[]> {
  try {
    console.log("[extractTextFromPDF] Starting, buffer byteLength:", buffer.byteLength);
    // Wrap buffer in Uint8Array to prevent PDF.js from transferring ownership
    const data = new Uint8Array(buffer.slice(0));
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    console.log("[extractTextFromPDF] PDF document loaded");
    const pages: string[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ")
        .trim();
      pages.push(pageText);
    }
    
    await pdf.destroy();
    return pages;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// --------------------------------------------------------------------------
// Layout-Aware Text Extraction
// --------------------------------------------------------------------------

/**
 * Extracts text with layout information preserved.
 * Returns structured content including text items with positioning data.
 * @param buffer - PDF file as ArrayBuffer
 * @returns Promise<PDFTextContent> - Structured text content with layout
 */
export async function extractTextWithLayout(buffer: ArrayBuffer): Promise<PDFTextContent> {
  try {
    console.log("[extractTextWithLayout] Starting, buffer byteLength:", buffer.byteLength);
    // Wrap buffer in Uint8Array to prevent PDF.js from transferring ownership
    const data = new Uint8Array(buffer.slice(0));
    console.log("[extractTextWithLayout] Created Uint8Array copy, byteLength:", data.byteLength);
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    console.log("[extractTextWithLayout] PDF document loaded");
    const pages: PDFPageContent[] = [];
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const items: PDFTextItem[] = textContent.items.map((item: any) => ({
        str: item.str || "",
        transform: item.transform,
        width: item.width,
        height: item.height,
        dir: item.dir,
        fontName: item.fontName,
      }));
      
      const pageText = items.map(item => item.str).join(" ").trim();
      
      pages.push({
        pageNumber: i,
        text: pageText,
        items,
        hasTextLayer: items.length > 0,
      });
      
      fullText += pageText + "\n\n";
    }
    
    await pdf.destroy();
    
    // Detect PDF type and assess quality
    const type = await detectPDFType(buffer);
    const quality = assessExtractionQuality(pages);
    
    return {
      pages,
      fullText: fullText.trim(),
      totalPages: pdf.numPages,
      type,
      quality,
    };
  } catch (error) {
    console.error("Error extracting text with layout from PDF:", error);
    throw new Error(`PDF layout extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// --------------------------------------------------------------------------
// Extraction Quality Assessment
// --------------------------------------------------------------------------

/**
 * Assesses the quality of text extraction.
 * @param pages - Array of page content
 * @returns ExtractionQuality - Quality metrics
 */
function assessExtractionQuality(pages: PDFPageContent[]): ExtractionQuality {
  const issues: string[] = [];
  let totalItems = 0;
  let totalTextLength = 0;
  let pagesWithText = 0;
  
  for (const page of pages) {
    totalItems += page.items.length;
    totalTextLength += page.text.length;
    
    if (page.items.length > 0) {
      pagesWithText++;
    }
    
    // Check for suspicious patterns
    if (page.items.length > 0 && page.text.length < 10) {
      issues.push(`Page ${page.pageNumber} has items but very little text`);
    }
    
    if (page.items.length === 0 && page.text.length === 0) {
      issues.push(`Page ${page.pageNumber} has no text content`);
    }
  }
  
  const hasTextLayer = pagesWithText === pages.length;
  const textDensity = totalTextLength / Math.max(pages.length, 1);
  const averageItemLength = totalItems > 0 ? totalTextLength / totalItems : 0;
  
  // Calculate quality score (0-1)
  let score = 0;
  
  // Text layer presence (40% weight)
  if (hasTextLayer) {
    score += 0.4;
  } else if (pagesWithText > 0) {
    score += 0.2 * (pagesWithText / pages.length);
  }
  
  // Text density (30% weight)
  if (textDensity > 500) {
    score += 0.3;
  } else if (textDensity > 200) {
    score += 0.2;
  } else if (textDensity > 50) {
    score += 0.1;
  }
  
  // Average item length (20% weight)
  if (averageItemLength > 3) {
    score += 0.2;
  } else if (averageItemLength > 1) {
    score += 0.1;
  }
  
  // Issue penalty (10% weight)
  const issueRatio = issues.length / Math.max(pages.length, 1);
  score -= issueRatio * 0.1;
  
  score = Math.max(0, Math.min(1, score));
  
  return {
    score,
    hasTextLayer,
    textDensity,
    averageItemLength,
    issues,
  };
}

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Converts ArrayBuffer to base64 string (for compatibility with existing code).
 * @param buffer - ArrayBuffer
 * @returns string - Base64 encoded string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Estimates if a PDF is likely to be a transcript based on content.
 * This is a heuristic check to help with early validation.
 * @param content - PDF text content
 * @returns boolean - True if content looks like a transcript
 */
export function looksLikeTranscript(content: PDFTextContent): boolean {
  const text = content.fullText.toLowerCase();
  
  // Check for common transcript indicators
  const transcriptIndicators = [
    "gpa",
    "cgpa",
    "cumulative",
    "semester",
    "fall",
    "spring",
    "summer",
    "winter",
    "credit",
    "grade",
    "course",
    "معدل",
    "تراكمي",
    "فصل",
    "خريف",
    "ربيع",
    "صيف",
    "ساعة",
    "تقدير",
    "مقرر",
  ];
  
  const matchCount = transcriptIndicators.filter(indicator => 
    text.includes(indicator)
  ).length;
  
  // If at least 3 indicators match, likely a transcript
  return matchCount >= 3;
}
