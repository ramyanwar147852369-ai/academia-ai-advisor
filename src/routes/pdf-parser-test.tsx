import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  extractTextWithLayout,
  detectPDFType,
  type PDFTextContent,
  type PDFType,
} from "@/lib/pdf-text-extractor";
import {
  parsePDFTranscript,
  calculateConfidence,
  validateTranscript,
  type ParsedTranscript,
  type ConfidenceScore,
  type ValidationResult,
} from "@/lib/pdf-transcript-parser";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/pdf-parser-test")({
  component: PDFParserTestPage,
});

function PDFParserTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Extraction results
  const [pdfType, setPdfType] = useState<PDFType | null>(null);
  const [extractionQuality, setExtractionQuality] = useState<number | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [parsedTranscript, setParsedTranscript] = useState<ParsedTranscript | null>(null);
  const [confidence, setConfidence] = useState<ConfidenceScore | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setError(null);
      resetResults();
    } else {
      setError("Please select a valid PDF file");
      setFile(null);
    }
  };

  const resetResults = () => {
    setPdfType(null);
    setExtractionQuality(null);
    setExtractedText("");
    setParsedTranscript(null);
    setConfidence(null);
    setValidation(null);
  };

  const handleProcess = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      console.log("[PDF Parser Test] Starting PDF processing");
      const arrayBuffer = await file.arrayBuffer();
      console.log("[PDF Parser Test] ArrayBuffer created, byteLength:", arrayBuffer.byteLength);

      // Step 1: Detect PDF type
      console.log("[PDF Parser Test] Calling detectPDFType with original buffer");
      const detectedType = await detectPDFType(arrayBuffer);
      console.log("[PDF Parser Test] detectPDFType completed");
      setPdfType(detectedType);

      // Step 2: Extract text with layout (buffer is no longer cloned - PDF.js now wraps internally)
      console.log("[PDF Parser Test] Calling extractTextWithLayout with original buffer");
      const pdfContent = await extractTextWithLayout(arrayBuffer);
      console.log("[PDF Parser Test] extractTextWithLayout completed");
      setExtractionQuality(pdfContent.quality.score);
      setExtractedText(pdfContent.fullText);

      // Step 3: Parse transcript
      const transcript = parsePDFTranscript(pdfContent);
      if (!transcript) {
        setError("Failed to parse transcript from extracted text");
        setLoading(false);
        return;
      }
      setParsedTranscript(transcript);

      // Step 4: Calculate confidence
      const confScore = calculateConfidence(transcript);
      setConfidence(confScore);

      // Step 5: Validate transcript
      const validationResult = validateTranscript(transcript);
      setValidation(validationResult);

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      resetResults();
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const semesterCount = parsedTranscript?.semesters.length || 0;
  const courseCount = parsedTranscript?.semesters.reduce((sum, s) => sum + s.courses.length, 0) || 0;
  const detectedGPA = parsedTranscript?.currentGPA;
  const detectedCGPA = parsedTranscript?.cgpa;
  const detectedStatus = parsedTranscript?.semesters[0]?.status;
  
  // Find special course codes
  const specialCodes = ["HUMX76", "HUMX73", "HUMX75", "---291", "---391"];
  const detectedSpecialCodes = parsedTranscript?.semesters.flatMap(s => 
    s.courses.filter(c => specialCodes.includes(c.code)).map(c => c.code)
  ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50">
            PDF Parser Test Page
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Isolated testing environment for deterministic PDF transcript parser
          </p>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Testing Only - Not Connected to Production
          </Badge>
        </div>

        {/* Upload Section */}
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="flex-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <Button
                onClick={handleProcess}
                disabled={!file || loading}
                className="min-w-[120px]"
              >
                {loading ? "Processing..." : "Process PDF"}
              </Button>
            </div>
            
            {file && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <FileText className="w-4 h-4" />
                <span>{file.name}</span>
                <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Results Section */}
        {parsedTranscript && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{semesterCount}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Semesters</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{courseCount}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Courses</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {detectedGPA?.toFixed(2) ?? "N/A"}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">GPA</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                  {detectedCGPA?.toFixed(2) ?? "N/A"}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">CGPA</div>
              </Card>
            </div>

            {/* PDF Type & Quality */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50">
                PDF Analysis
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">PDF Type</div>
                  <Badge variant={pdfType === "digital" ? "default" : "secondary"}>
                    {pdfType?.toUpperCase() || "Unknown"}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Extraction Quality</div>
                  <Badge variant={extractionQuality && extractionQuality > 0.8 ? "default" : "secondary"}>
                    {extractionQuality ? `${(extractionQuality * 100).toFixed(0)}%` : "N/A"}
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Enrollment Status */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50">
                Enrollment Status
              </h2>
              <Badge variant="outline" className="text-base px-3 py-1">
                {detectedStatus || "Not detected"}
              </Badge>
            </Card>

            {/* Special Course Codes */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50">
                Special Course Codes
              </h2>
              {detectedSpecialCodes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {detectedSpecialCodes.map((code) => (
                    <Badge key={code} variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
                      {code}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-slate-500 dark:text-slate-400">No special course codes detected</div>
              )}
            </Card>

            {/* Confidence Score */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50">
                Confidence Score
              </h2>
              {confidence && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl font-bold text-slate-900 dark:text-slate-50">
                      {(confidence.score * 100).toFixed(0)}%
                    </div>
                    {confidence.score >= 0.8 ? (
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    ) : confidence.score >= 0.5 ? (
                      <AlertTriangle className="w-8 h-8 text-amber-600" />
                    ) : (
                      <XCircle className="w-8 h-8 text-red-600" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Course Detection</div>
                      <div className="font-semibold">{(confidence.details.courseDetection * 100).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Grade Detection</div>
                      <div className="font-semibold">{(confidence.details.gradeDetection * 100).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Credit Detection</div>
                      <div className="font-semibold">{(confidence.details.creditDetection * 100).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">Semester Detection</div>
                      <div className="font-semibold">{(confidence.details.semesterDetection * 100).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-slate-600 dark:text-slate-400">GPA Detection</div>
                      <div className="font-semibold">{(confidence.details.gpaDetection * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Validation Result */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50">
                Validation Result
              </h2>
              {validation && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {validation.valid ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className="font-semibold">
                      {validation.valid ? "Validation Passed" : "Validation Failed"}
                    </span>
                  </div>
                  {validation.errors.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                      <div className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
                        Errors ({validation.errors.length}):
                      </div>
                      <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 space-y-1">
                        {validation.errors.map((error, i) => (
                          <li key={i}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Extracted Text */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50">
                Extracted Text
              </h2>
              <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg overflow-x-auto text-sm text-slate-700 dark:text-slate-300 max-h-96 overflow-y-auto">
                {extractedText || "No text extracted"}
              </pre>
            </Card>

            {/* Parsed Transcript JSON */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-50">
                Parsed Transcript JSON
              </h2>
              <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg overflow-x-auto text-sm text-slate-700 dark:text-slate-300 max-h-96 overflow-y-auto">
                {JSON.stringify(parsedTranscript, null, 2)}
              </pre>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
