import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import {
  analyzeTranscript,
  analyzeStructuredTranscript,
  generateAIRecommendations,
  translateReportText,
  type AdvisorReport,
  type RiskLevel,
} from "@/lib/advisor.functions";
import { parseExcelTranscript } from "@/lib/excel-transcript";
import {
  parseTextTranscript,
  calculateConfidence,
  validateTranscript,
  type ParsedTranscript,
} from "@/lib/text-transcript-parser";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  GraduationCap,
  Upload,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  TrendingDown,
  BookOpen,
  FileText,
  Sparkles,
  Moon,
  Sun,
  Activity,
  Layers,
  RefreshCcw,
  ScrollText,
  Languages,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "AI Academic Advisor — Transcript Analysis & Risk Forecast" },
      {
        name: "description",
        content:
          "Upload your transcript. Get instant GPA analysis, warning-semester tracking, dismissal risk, and AI-powered academic recommendations.",
      },
    ],
  }),
});

type Lang = "en" | "ar";

const T = {
  en: {
    brand: "Academia AI",
    tagline: "Academic Advisor",
    badge: "AI-powered academic risk forecasting",
    heroTitle1: "Know exactly where you",
    heroTitleEm: "stand",
    heroTitle2: "— before it's too late.",
    heroSub:
      "Upload your transcript and Academia AI evaluates every semester, applies your institution's warning rules, predicts dismissal risk, and tells you whether to register next term.",
    upload: "Upload transcript",
    uploadHint: "PDF, Excel (.xlsx) or pasted text. Your data is processed once and not stored.",
    file: "Transcript file",
    filePlaceholder: "PDF or Excel",
    pasteLabel: "Or paste transcript text",
    pasteHolder: "Course code, course name, credits, grade, semester, status…",
    analyze: "Run AI analysis",
    analyzing: "Analyzing transcript…",
    needInput: "Paste your transcript or upload a PDF / Excel file.",
    rulesTitle: "Academic Dismissal Rules Used by the AI System",
    ruleA:
      "A. If the cumulative GPA (CGPA) or semester GPA stays below 2.0 for 6 regular semesters, the student becomes subject to academic dismissal.",
    ruleB:
      "B. Summer semesters are NOT counted as warning semesters. If a summer raises the semester GPA or CGPA to 2.0 or higher, the system resets and recounts warning semesters from zero.",
    ruleC:
      "C. A semester counts toward warnings only if the student's status that semester is \"Enrolled\".",
    ruleD:
      "D. Summer & Spring 2020 only recover, never add warnings, or count toward the number of regular semesters counted for study.",
    ruleE:
      "E. With 5 warning semesters, the AI recommends NOT registering for the next semester to avoid dismissal. Below 5, it recommends continuing registration.",
    ruleF:
      "F. A student will be dismissed if the number of regular semesters (Fall and Spring) reaches 20 semesters.",
    parsing: "Parsing transcript and applying academic rules…",
    reportHeader: "Advisor Report",
    standing: "Academic Standing",
    riskLevel: "Risk level",
    notRegisterTitle: "Do NOT Register Next Semester",
    notRegisterBody:
      "You currently have {n} warning semesters. Registering for another regular term risks academic dismissal under the 6-warning rule. Confirm with your university advisor.",
    cgpa: "CGPA",
    currentGpa: "Current GPA",
    warningSems: "Warning Semesters",
    remaining: "Semesters Remaining Until Dismissal",
    countedSems: "Counted Study Semesters",
    remainingCountedSems: "Remaining Study Semesters",
    suggestedLoad: "Suggested Load",
    cr: "cr",
    gpaProgression: "GPA Progression",
    riskForecast: "Risk Forecast",
    riskScore: "Risk score",
    dismissalNext: "Dismissal risk next term",
    likely: "Likely",
    unlikely: "Unlikely",
    warningStreak: "Warning streak",
    failedCount: "Failed courses",
    aiRecs: "AI Recommendations",
    aiRecsLoading: "Generating AI recommendations…",
    aiRecsUnavailable:
      "AI recommendations are temporarily unavailable. Core academic analysis above is unaffected.",
    warnings: "Warnings",
    noWarnings: "No active warnings.",
    failedCoursesTitle: "Failed Courses (retake)",
    noneKeepUp: "None — keep it up.",
    code: "Code",
    course: "Course",
    crShort: "Cr",
    grade: "Grade",
    semesterBreakdown: "Semester Breakdown",
    courses: "courses",
    warningBadge: "Warning #",
    resetBadge: "Reset ✓",
    summerBadge: "Summer (recovery)",
    countedBadge: "Counted",
    notEnrolledBadge: "Not counted",
    credits: "credits",
    howItWorks: "How it works",
    steps: [
      "Upload your transcript (PDF, Excel, or text).",
      "AI extracts every semester, GPA, CGPA, status & course list.",
      "Academic rules compute warning semesters & dismissal risk.",
      "You get registration advice, retake plan & load suggestion.",
    ],
    hint1: "GPA / CGPA ≥ 2 resets warnings",
    hint2: "Summer & Spring 2020 only recover, never add warnings, or count toward the number of regular semesters counted for study.",
    hint3: "5 warnings → do not register next semester",
    gpaLegend: "Semester GPA",
    cgpaLegend: "Cumulative GPA",
    axisSemesters: "Semesters",
    pasteHelpTitle: "No file? Paste your transcript instead",
    pasteHelpBody:
      "Copy the full transcript text from your student portal (Arabic or English) and paste it below. Keep one course per line and include the course code, course name, credits, grade, semester name, and your status (Enrolled / Withdrawn / Dismissed).",
    pasteTips: [
      "Include every semester — Fall, Spring, and Summer — in order.",
      "Keep the GPA, CGPA, and credit-hour numbers untouched.",
      "Arabic and English transcripts are both supported.",
      "Status formats: 'Status: Withdrawn' on a separate line, or 'Spring 2023/2024 (Withdrawn)' on the same line. If no enrollment status is specified, the semester should be treated as Enrolled.",
      "GPA/CGPA can be on separate lines or the same line: 'CGPA 1.9 GPA 2.0'",
    ],
    supportedStatuses: {
      title: "Supported Enrollment Statuses",
      enrolled: "Statuses treated as Enrolled:",
      enrolledList: "Enrolled, Active, In Good Standing, Probation, Warning, Academic Warning.",
      nonEnrolled: "Statuses treated as Non-Enrolled:",
      nonEnrolledList: "Withdrawn, Withdraw, W, Withdrawal, Unofficial Withdrawal, Official Withdrawal, Deferred, Postponed, Delayed, Dismissed, Expelled, Terminated, Disciplinary Dismissal, Suspended, On Suspension, Registration Suspension, Enrollment Suspension, Disciplinary Suspension, Leave of Absence, Academic Leave, Study Leave, Semester Leave, Leave of Study.",
      note: "These statuses are supported when using either Excel Upload or Paste Transcript Text.",
    },
    supportedGrades: {
      title: "Supported Grades",
      passing: "Passing / Non-Failing Grades:",
      passingList: "A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, P, PASS, CR, S, W, WP, WD, I, IP, IC, NC.",
      failing: "Failing Grades:",
      failingList: "F, FA, FW, FF, WF, NP, U.",
      note: "These grades are supported for both Excel Upload and Paste Transcript Text.",
    },
    transcriptExample: {
      title: "Complete Transcript Example",
      example: "Fall 2023/2024\n\nCS101 Programming 1 A 3\nCS102 Programming 2 A 3\nMATH101 Calculus 1 B+ 3\n\nGPA 1.9  CGPA 1.8",
    },
    footer1:
      "Academia AI · Educational advisory tool. Verify decisions with your educational institution's official advisor.",
    footer2:
      "All intellectual property and copyrights reserved to Engineer Ramy Anwar Mostafa.",
    langLabel: "العربية",
  },
  ar: {
    brand: "أكاديميا AI",
    tagline: "المرشد الأكاديمي",
    badge: "تنبؤ بالمخاطر الأكاديمية بالذكاء الاصطناعي",
    heroTitle1: "اعرف بدقة أين",
    heroTitleEm: "تقف",
    heroTitle2: "— قبل فوات الأوان.",
    heroSub:
      "ارفع كشف درجاتك وسيقوم أكاديميا AI بتحليل كل فصل دراسي وتطبيق قواعد الإنذار الأكاديمي وتقدير خطر الفصل وإخبارك ما إذا كنت ستسجل في الفصل القادم.",
    upload: "رفع كشف الدرجات",
    uploadHint: "ملف PDF أو Excel أو نص ملصق. تتم معالجة بياناتك مرة واحدة دون تخزين.",
    file: "ملف كشف الدرجات",
    filePlaceholder: "PDF أو Excel",
    pasteLabel: "أو الصق نص كشف الدرجات",
    pasteHolder: "رمز المقرر، اسم المقرر، الساعات، التقدير، الفصل، الحالة…",
    analyze: "ابدأ التحليل بالذكاء الاصطناعي",
    analyzing: "جارٍ تحليل كشف الدرجات…",
    needInput: "الصق كشف الدرجات أو ارفع ملف PDF / Excel.",
    rulesTitle: "قواعد الفصل الأكاديمي المعتمدة في نظام الذكاء الاصطناعي",
    ruleA:
      "أ. إذا ظل المعدل التراكمي (CGPA) أو معدل الفصل أقل من 2.0 لمدة 6 فصول دراسية عادية، يصبح الطالب معرضًا للفصل الأكاديمي.",
    ruleB:
      "ب. لا يتم احتساب الفصول الصيفية كفصول إنذار. وإذا رفع الفصل الصيفي معدل الفصل أو المعدل التراكمي إلى 2.0 أو أعلى، يقوم النظام بإعادة احتساب فصول الإنذار من البداية.",
    ruleC:
      "ج. لا يُحتسب الفصل ضمن فصول الإنذار إلا إذا كانت حالة الطالب فيه \"مُسجَّل\" (Enrolled).",
    ruleD:
      "د. الفصل الصيفي و Spring 2020 (Recovery) مخصصان للتعافي الأكاديمي فقط، ولا يتم احتساب أي إنذارات أكاديمية عليهما، كما لا يتم احتسابهما ضمن عدد الفصول الدراسية الرئيسية المحتسبة للدراسة.",
    ruleE:
      "هـ. عند وجود 5 فصول إنذار، يوصي النظام بعدم التسجيل في الفصل التالي تجنبًا للفصل الأكاديمي. أما إذا كانت أقل من 5، فيوصي بمواصلة التسجيل.",
    ruleF:
      "و. يفصل الطالب في حالة وصول عدد الفصول الدراسية الرئيسية (الخريف والربيع) إلى 20 فصلًا دراسيًا.",
    parsing: "جارٍ قراءة كشف الدرجات وتطبيق القواعد الأكاديمية…",
    reportHeader: "تقرير المرشد",
    standing: "الوضع الأكاديمي",
    riskLevel: "مستوى الخطر",
    notRegisterTitle: "لا تسجّل في الفصل القادم",
    notRegisterBody:
      "لديك حاليًا {n} فصول إنذار. التسجيل في فصل عادي آخر قد يؤدي إلى الفصل الأكاديمي وفق قاعدة الـ6 إنذارات. تأكد من ذلك مع مرشدك الأكاديمي.",
    cgpa: "المعدل التراكمي",
    currentGpa: "معدل الفصل الحالي",
    warningSems: "فصول الإنذار",
    remaining: "الفصول المتبقية للفصل",
    countedSems: "الفصول الدراسية المحتسبة للدراسة",
    remainingCountedSems: "الفصول الدراسية المتبقية للدراسة",
    suggestedLoad: "الحمل الدراسي المقترح",
    cr: "س.م",
    gpaProgression: "تطور المعدل",
    riskForecast: "تقدير الخطر",
    riskScore: "درجة الخطر",
    dismissalNext: "خطر الفصل في الترم القادم",
    likely: "مرجح",
    unlikely: "غير مرجح",
    warningStreak: "تتابع الإنذارات",
    failedCount: "المقررات الراسبة",
    aiRecs: "توصيات الذكاء الاصطناعي",
    aiRecsLoading: "جارٍ توليد توصيات الذكاء الاصطناعي…",
    aiRecsUnavailable:
      "توصيات الذكاء الاصطناعي غير متاحة حاليًا. لا يؤثر ذلك على التحليل الأكاديمي الأساسي أعلاه.",
    warnings: "التنبيهات",
    noWarnings: "لا توجد تنبيهات نشطة.",
    failedCoursesTitle: "المقررات الراسبة (إعادة)",
    noneKeepUp: "لا يوجد — أحسنت.",
    code: "الرمز",
    course: "المقرر",
    crShort: "س.م",
    grade: "التقدير",
    semesterBreakdown: "تفاصيل الفصول",
    courses: "مقررات",
    warningBadge: "إنذار #",
    resetBadge: "تم التصفير ✓",
    summerBadge: "صيفي (تعافٍ)",
    countedBadge: "محتسب",
    notEnrolledBadge: "غير محتسب",
    credits: "ساعة",
    howItWorks: "كيف يعمل",
    steps: [
      "ارفع كشف درجاتك (PDF أو Excel أو نص).",
      "يستخرج الذكاء الاصطناعي كل فصل والمعدل والمقررات والحالة.",
      "تُحسب القواعد الأكاديمية فصول الإنذار وخطر الفصل.",
      "تحصل على توصية بالتسجيل وخطة إعادة المقررات والحمل المقترح.",
    ],
    hint1: "المعدل ≥ 2 يصفّر الإنذارات",
    hint2: "الفصل الصيفي و Spring 2020 (Recovery) مخصصان للتعافي الأكاديمي فقط، ولا يتم احتساب أي إنذارات أكاديمية عليهما، كما لا يتم احتسابهما ضمن عدد الفصول الدراسية الرئيسية المحتسبة للدراسة.",
    hint3: "5 إنذارات → لا تسجّل الفصل القادم",
    gpaLegend: "المعدل الفصلي",
    cgpaLegend: "المعدل التراكمي",
    axisSemesters: "الفصول الدراسية",
    pasteHelpTitle: "لا يوجد ملف؟ الصق كشف الدرجات بدلًا من ذلك",
    pasteHelpBody:
      "انسخ النص الكامل لكشف الدرجات من البوابة الطلابية (بالعربية أو الإنجليزية) والصقه في الأسفل. اجعل كل مقرر في سطر مستقل، وتأكد من تضمين رمز المقرر، اسم المقرر، الساعات، التقدير، اسم الفصل، وحالتك (مقيد / منسحب / مفصول).",
    pasteTips: [
      "أدرج كل الفصول — خريف وربيع وصيف — بالترتيب الزمني.",
      "لا تعدل قيم المعدل الفصلي والتراكمي والساعات المعتمدة.",
      "النظام يدعم كشوف الدرجات بالعربية والإنجليزية على حدٍ سواء.",
      "تنسيقات الحالة: 'الحالة: منسحب' في سطر منفصل، أو 'ربيع 2023/2024 (منسحب)' في نفس السطر. وإذا لم يتم تحديد حالة القيد فسيتم اعتبار الفصل الدراسي (مقيد).",
      "يمكن كتابة المعدل الفصلي والتراكمي في سطرين مختلفين أو في نفس السطر: 'CGPA 1.9 GPA 2.0'",
    ],
    supportedStatuses: {
      title: "حالات القيد المدعومة",
      enrolled: "الحالات التي يعتبر الطالب فيها مقيدًا:",
      enrolledList: "مقيد، مسجل، مُسجَّل، منتظم، مستمر، قيد الدراسة، منذر، إنذار.",
      nonEnrolled: "الحالات التي يعتبر الطالب فيها غير مقيد:",
      nonEnrolledList: "منسحب، انسحاب، مؤجل، تأجيل، موقوف، إيقاف، إيقاف قيد، منقطع، انقطاع، انقطاع عن الدراسة، انقطاع عن فصل دراسي، معتذر عن فصل، معتذر عن فصول، اعتذار عن الدراسة، اعتذار عن فصل دراسي، فصل، فصل نهائي، فصل نهائي من الجامعة، فصل تأديبي، مفصول، محروم، غير مقيد، غير منتظم، غير مسجل.",
      note: "هذه الحالات مدعومة سواء عند رفع ملف Excel أو عند استخدام Paste Transcript Text.",
    },
    supportedGrades: {
      title: "التقديرات المدعومة",
      passing: "تقديرات النجاح:",
      passingList: "أ+، أ، أ-، ب+، ب، ب-، ج+، ج، ج-، د+، د، د-، ناجح، نجاح، مكتمل، اجتاز، منسحب.",
      failing: "تقديرات الرسوب:",
      failingList: "ر، راسب، رسوب، غ، غائب، م، محروم، ناقص، إعادة.",
      note: "هذه التقديرات مدعومة سواء عند رفع ملف Excel أو عند استخدام Paste Transcript Text.",
    },
    transcriptExample: {
      title: "مثال كشف درجات كامل",
      example: "خريف 2023/2024\n\nبر101 برمجة 1 أ 3\nبر102 برمجة 2 أ 3\nريض101 تفاضل وتكامل ب+ 3\n\nالمعدل الفصلي 2\nالمعدل التراكمي 1.98",
    },
    footer1:
      "أكاديميا AI · أداة إرشادية تعليمية. تأكد من القرارات مع المرشد الرسمي في مؤسستك التعليمية.",
    footer2:
      "جميع حقوق الملكية الفكرية والنشر محفوظة للمهندس / رامي أنور مصطفى.",
    langLabel: "English",
  },
} as const;

const RISK_META: Record<
  RiskLevel,
  { label: { en: string; ar: string }; tone: string; bg: string; icon: typeof CheckCircle2 }
> = {
  safe: {
    label: { en: "Safe", ar: "آمن" },
    tone: "text-[color:var(--success)]",
    bg: "bg-[color:var(--success)]/10 border-[color:var(--success)]/30",
    icon: CheckCircle2,
  },
  warning: {
    label: { en: "Warning", ar: "إنذار" },
    tone: "text-[color:var(--warning)]",
    bg: "bg-[color:var(--warning)]/10 border-[color:var(--warning)]/30",
    icon: AlertTriangle,
  },
  high_risk: {
    label: { en: "High Risk", ar: "خطر مرتفع" },
    tone: "text-orange-500",
    bg: "bg-orange-500/10 border-orange-500/30",
    icon: TrendingDown,
  },
  dismissal_risk: {
    label: { en: "Academic Dismissal Risk", ar: "خطر الفصل الأكاديمي" },
    tone: "text-destructive",
    bg: "bg-destructive/10 border-destructive/40",
    icon: ShieldAlert,
  },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}



function Dashboard() {
  const analyze = useServerFn(analyzeTranscript);
  const analyzeStructured = useServerFn(analyzeStructuredTranscript);

  const aiRecs = useServerFn(generateAIRecommendations);
  const translate = useServerFn(translateReportText);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AdvisorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(true);
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];
  const isRTL = lang === "ar";
  const [reportLang, setReportLang] = useState<Lang>("en");
  const [translating, setTranslating] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [parserError, setParserError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
  }, [lang, isRTL]);

  useEffect(() => {
    if (!report) return;
    if (reportLang === lang) return;
    let cancelled = false;
    setTranslating(true);
    translate({
      data: {
        lang,
        summary: report.summary,
        warnings: report.warnings,
        recommendations: report.recommendations,
      },
    })
      .then((res) => {
        if (cancelled) return;
        setReport((prev) =>
          prev
            ? {
                ...prev,
                summary: res.summary,
                warnings: res.warnings,
                recommendations: res.recommendations,
              }
            : prev,
        );
        setReportLang(lang);
      })
      .catch((e) => console.error("translate failed", e))
      .finally(() => {
        if (!cancelled) setTranslating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, report, reportLang, translate]);

  async function onAnalyze() {
    setError(null);
    setReport(null);
    if (!text.trim() && !file) {
      setError(t.needInput);
      return;
    }
    setLoading(true);
    try {
      let result: AdvisorReport;

      const isExcel =
        !!file &&
        (file.name.toLowerCase().endsWith(".xlsx") ||
          file.name.toLowerCase().endsWith(".xls") ||
          file.name.toLowerCase().endsWith(".csv") ||
          file.type.includes("spreadsheet") ||
          file.type.includes("excel"));

      if (isExcel && file) {
        // Excel path: parse deterministically on the client, then hand the
        // structured semesters to the server. Gemini is NOT called for
        // Excel transcripts. On parse failure, show a clear error and stop —
        // do NOT silently fall back to AI extraction.
        const buf = await readFileAsArrayBuffer(file);
        let parsed;
        try {
          parsed = parseExcelTranscript(buf);
        } catch (e) {
          throw e instanceof Error
            ? e
            : new Error("Failed to parse Excel transcript.");
        }
        result = await analyzeStructured({
          data: { institution: "OHI", lang, parsed },
        });
      } else if (text.trim() && !file) {
        // Pasted text path: try deterministic parser first, fall back to Gemini
        setParserError(null);
        const parsed = parseTextTranscript(text.trim());
        
        if (parsed) {
          const confidence = calculateConfidence(parsed);
          const validation = validateTranscript(parsed);
          
          // Use deterministic parsing if confidence >= 0.7 and validation passes
          // Lowered threshold to support valid 2-course transcripts
          if (confidence.score >= 0.7 && validation.valid) {
            result = await analyzeStructured({
              data: { institution: "OHI", lang, parsed },
            });
          } else {
            // Show validation errors if present
            if (!validation.valid && validation.errors.length > 0) {
              const errorText = validation.errors.join(". ");
              setParserError(
                lang === "ar"
                  ? `خطأ في التحقق من صحة الكشف: ${errorText}. يرجى تصحيح البيانات والمحاولة مرة أخرى.`
                  : `Validation error: ${errorText}. Please correct the data and try again.`
              );
              setLoading(false);
              return;
            }
            // Low confidence but valid - try Gemini fallback with error handling
            try {
              result = await analyze({
                data: { institution: "OHI", lang, text: text.trim() },
              });
            } catch (e) {
              // Handle Gemini unavailability with user-friendly error
              if (e instanceof Error) {
                const errorMessage = e.message.toLowerCase();
                if (
                  errorMessage.includes("api key") ||
                  errorMessage.includes("gemini_api_key") ||
                  errorMessage.includes("rate limit") ||
                  errorMessage.includes("quota") ||
                  errorMessage.includes("unavailable") ||
                  errorMessage.includes("timeout") ||
                  errorMessage.includes("429") ||
                  errorMessage.includes("500")
                ) {
                  setParserError(
                    lang === "ar"
                      ? "تعذر التعرف على تنسيق كشف الدرجات. يرجى إعادة تنسيق الكشف باستخدام أحد التنسيقات المدعومة أدناه."
                      : "Unable to recognize the transcript format. Please reformat the transcript using one of the supported formats below."
                  );
                  setLoading(false);
                  return;
                }
              }
              throw e;
            }
          }
        } else {
          // Parser failed, try Gemini fallback with error handling
          try {
            result = await analyze({
              data: { institution: "OHI", lang, text: text.trim() },
            });
          } catch (e) {
            // Handle Gemini unavailability with user-friendly error
            if (e instanceof Error) {
              const errorMessage = e.message.toLowerCase();
              if (
                errorMessage.includes("api key") ||
                errorMessage.includes("gemini_api_key") ||
                errorMessage.includes("rate limit") ||
                errorMessage.includes("quota") ||
                errorMessage.includes("unavailable") ||
                errorMessage.includes("timeout") ||
                errorMessage.includes("429") ||
                errorMessage.includes("500")
              ) {
                setParserError(
                  lang === "ar"
                    ? "تعذر التعرف على تنسيق كشف الدرجات. يرجى إعادة تنسيق الكشف باستخدام أحد التنسيقات المدعومة أدناه."
                    : "Unable to recognize the transcript format. Please reformat the transcript using one of the supported formats below."
                );
                setLoading(false);
                return;
              }
            }
            throw e;
          }
        }
      } else {
        // PDF/other files still use the existing Gemini path.
        const payload: {
          institution: string;
          text?: string;
          fileBase64?: string;
          mimeType?: string;
          fileName?: string;
          lang?: "en" | "ar";
        } = { institution: "OHI", lang };
        if (text.trim()) payload.text = text.trim();
        if (file) {
          payload.fileBase64 = await fileToBase64(file);
          payload.mimeType = file.type || "application/pdf";
          payload.fileName = file.name;
        }
        try {
          result = await analyze({ data: payload });
        } catch (e) {
          // Handle Gemini unavailability with user-friendly error
          if (e instanceof Error) {
            const errorMessage = e.message.toLowerCase();
            if (
              errorMessage.includes("api key") ||
              errorMessage.includes("rate limit") ||
              errorMessage.includes("quota") ||
              errorMessage.includes("unavailable") ||
              errorMessage.includes("timeout") ||
              errorMessage.includes("429") ||
              errorMessage.includes("500")
            ) {
              setParserError(
                lang === "ar"
                  ? "تعذر التعرف على تنسيق كشف الدرجات. يرجى إعادة تنسيق الكشف باستخدام أحد التنسيقات المدعومة أدناه."
                  : "Unable to recognize the transcript format. Please reformat the transcript using one of the supported formats below."
              );
              setLoading(false);
              return;
            }
          }
          throw e;
        }
      }

      setReport(result);
      setReportLang(lang);

      // Section 2 — AI recommendations. Optional, never blocks the report.
      setAiError(null);
      setAiLoading(true);
      aiRecs({ data: { lang, report: result } })
        .then((res) => {
          if (res.ok) {
            setReport((prev) =>
              prev
                ? {
                    ...prev,
                    summary: res.summary || prev.summary,
                    warnings: res.warnings.length ? res.warnings : prev.warnings,
                    recommendations: res.recommendations.length
                      ? res.recommendations
                      : prev.recommendations,
                    aiNarrativeAvailable: true,
                    aiNarrativeError: null,
                  }
                : prev,
            );
          } else {
            setAiError(res.error);
          }
        })
        .catch((e) => setAiError(e instanceof Error ? e.message : "ai_unavailable"))
        .finally(() => setAiLoading(false));
      setTimeout(
        () => document.getElementById("report")?.scrollIntoView({ behavior: "smooth" }),
        80,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className="h-9 w-9 rounded-md flex items-center justify-center text-primary-foreground"
              style={{ background: "var(--gradient-hero)" }}
            >
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg font-semibold leading-tight">
                {t.brand}
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t.tagline}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}
              className="rounded-md border border-border px-2.5 py-2 text-xs font-medium hover:bg-muted transition flex items-center gap-1.5"
              aria-label="Toggle language"
            >
              <Languages className="h-3.5 w-3.5" /> {t.langLabel}
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-md border border-border p-2 hover:bg-muted transition"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-12 pb-8">
        <Badge variant="outline" className="mb-4 border-accent/40 bg-accent/10 text-foreground">
          <Sparkles className="h-3 w-3 mx-1" /> {t.badge}
        </Badge>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.05] max-w-3xl">
          {t.heroTitle1} <em className="italic text-accent">{t.heroTitleEm}</em> {t.heroTitle2}
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          {t.heroSub}
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-12 grid lg:grid-cols-5 gap-6">
        <Card
          className="lg:col-span-3 p-6 sm:p-8"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4 text-accent" /> {t.upload}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t.uploadHint}
          </p>

          <div className="mt-5">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> {t.file}
            </label>
            <label className="mt-2 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-md px-3 py-3 cursor-pointer hover:border-accent transition-colors text-sm">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="truncate text-muted-foreground">
                {file ? file.name : t.filePlaceholder}
              </span>
              <input
                type="file"
                accept="application/pdf,image/*,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="mt-6 rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="text-sm font-semibold">{t.pasteHelpTitle}</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {t.pasteHelpBody}
            </p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc ps-5">
              {t.pasteTips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>

            {/* Complete transcript example */}
            <div className="mt-4 pt-4 border-t border-border/60">
              <div className="text-xs font-semibold text-foreground mb-2">
                {t.transcriptExample.title}
              </div>
              <div className="text-xs bg-background/50 border border-border/40 rounded p-2 font-mono whitespace-pre-wrap">
                {t.transcriptExample.example}
              </div>
            </div>

            {/* User guidance section */}
            <div className="mt-4 pt-4 border-t border-border/60">
              <div className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "التنسيقات المدعومة:" : "Supported Formats:"}
              </div>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium">Format A:</span> CS101 Programming 1 A 3
                </div>
                <div>
                  <span className="font-medium">Format B:</span> CS101 | Programming 1 | A | 3
                </div>
                <div>
                  <span className="font-medium">Format C:</span> CS101, Programming 1, A, 3
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium">{lang === "ar" ? "الحقول المطلوبة:" : "Required Fields:"}</span>
                <span className="ms-2">
                  {lang === "ar" ? "رمز المقرر، اسم المقرر، التقدير، الساعات المعتمدة" : "Course Code, Course Name, Grade, Credit Hours"}
                </span>
              </div>
            </div>
            
            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t.pasteLabel}
            </label>
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParserError(null);
              }}
              placeholder={t.pasteHolder}
              className="mt-2 min-h-[160px] font-mono text-sm bg-background"
              dir={isRTL ? "rtl" : "ltr"}
            />
          </div>


          {error && (
            <p className="mt-4 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {error}
            </p>
          )}

          {parserError && (
            <Card className="mt-4 p-4 border-destructive/50 bg-destructive/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">{parserError}</p>
                  <div className="mt-3 text-xs text-muted-foreground">
                    <div className="font-semibold mb-1">{lang === "ar" ? "مثال:" : "Example:"}</div>
                    <div className="font-mono bg-background/50 p-2 rounded mt-1">
                      {lang === "ar" ? "خريف 2023/2024\nCS101 برمجة 1 أ 3\nMATH101 حساب 1 ب+ 3\nمعدل الفصل: 3.45\nالمعدل التراكمي: 3.12" : "Fall 2023/2024\nCS101 Programming 1 A 3\nMATH101 Calculus 1 B+ 3\nSemester GPA: 3.45\nCGPA: 3.12"}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Button
            onClick={onAnalyze}
            disabled={loading}
            size="lg"
            className="mt-6 w-full text-base"
            style={{ background: "var(--gradient-hero)", color: "white" }}
          >
            {loading ? t.analyzing : t.analyze}
          </Button>
        </Card>

        <Card className="lg:col-span-2 p-6 sm:p-8 bg-muted/40">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-accent" /> {t.rulesTitle}
          </h3>
          <ul className="mt-4 space-y-3 text-sm">
            {[t.ruleA, t.ruleB, t.ruleC, t.ruleD, t.ruleE, t.ruleF].map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-accent shrink-0">◆</span>
                <span className="text-foreground/85 leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 pt-5 border-t border-border/60 text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-[color:var(--success)] shrink-0" /> {t.hint1}
            </p>
            <p className="flex items-center gap-1.5">
              <RefreshCcw className="h-3 w-3 text-accent shrink-0" /> {t.hint2}
            </p>
            <p className="flex items-center gap-1.5">
              <ShieldAlert className="h-3 w-3 text-destructive shrink-0" /> {t.hint3}
            </p>
          </div>

          {/* Supported enrollment statuses */}
          <div className="mt-6 pt-5 border-t border-border/60">
            <div className="text-xs font-semibold text-foreground mb-2">
              {t.supportedStatuses.title}
            </div>
            <div className="text-xs space-y-2">
              <div>
                <div className="font-semibold text-muted-foreground">{t.supportedStatuses.enrolled}</div>
                <div className="text-muted-foreground">{t.supportedStatuses.enrolledList}</div>
              </div>
              <div>
                <div className="font-semibold text-muted-foreground">{t.supportedStatuses.nonEnrolled}</div>
                <div className="text-muted-foreground">{t.supportedStatuses.nonEnrolledList}</div>
              </div>
              <div className="text-muted-foreground italic">{t.supportedStatuses.note}</div>
            </div>
          </div>

          {/* Supported grades */}
          <div className="mt-6 pt-5 border-t border-border/60">
            <div className="text-xs font-semibold text-foreground mb-2">
              {t.supportedGrades.title}
            </div>
            <div className="text-xs space-y-2">
              <div>
                <div className="font-semibold text-muted-foreground">{t.supportedGrades.passing}</div>
                <div className="text-muted-foreground">{t.supportedGrades.passingList}</div>
              </div>
              <div>
                <div className="font-semibold text-muted-foreground">{t.supportedGrades.failing}</div>
                <div className="text-muted-foreground">{t.supportedGrades.failingList}</div>
              </div>
              <div className="text-muted-foreground italic">{t.supportedGrades.note}</div>
            </div>
          </div>
        </Card>
      </section>

      {loading && (
        <section className="mx-auto max-w-5xl px-6 pb-16">
          <Card className="p-10 text-center">
            <div className="inline-flex items-center gap-3 text-muted-foreground">
              <Activity className="h-5 w-5 animate-pulse text-accent" />
              {t.parsing}
            </div>
          </Card>
        </section>
      )}

      {report && (
        <ReportView
          report={report}
          t={t as TStrings}
          lang={lang}
          aiLoading={aiLoading}
          aiError={aiError}
        />
      )}

      <footer className="border-t border-border/60 py-8 px-4 text-center text-xs text-muted-foreground space-y-2">
        <p>{t.footer1}</p>
        <p className="font-medium text-foreground/80">© {t.footer2}</p>
      </footer>
    </div>
  );
}

type TStrings = (typeof T)["en"];

// Helper function to determine if semester is enrolled (replicating existing academic logic from advisor.functions.ts)
function isEnrolledStatus(status: string | undefined | null): boolean {
  if (status == null) return true;
  const raw = String(status).trim();
  if (raw === "") return true;
  // Arabic negation: explicit "غير مقيد" / "غير منتظم" is NOT enrolled.
  if (/غير\s*(مقيد|منتظم|مسجل)/.test(raw)) return false;
  // Arabic enrolled synonyms
  if (/(مقيد|مسجل|مُسجَّل|منتظم|مستمر|قيد\s*الدراسة)/.test(raw)) return true;
  // Arabic non-enrolled statuses
  if (/(منسحب|انسحاب|مؤجل|تأجيل|موقوف|إيقاف|مفصول|فصل|محروم|منذر)/.test(raw)) return false;
  return raw.toLowerCase() === "enrolled";
}

function ReportView({
  report,
  t,
  lang,
  aiLoading,
  aiError,
}: {
  report: AdvisorReport;
  t: TStrings;
  lang: Lang;
  aiLoading: boolean;
  aiError: string | null;
}) {
  const risk = RISK_META[report.riskLevel];
  const RiskIcon = risk.icon;

  // Short X-axis labels so all semesters (up to 20+) stay visible on the chart
  // without overcrowding. English: "Fall 2017/2018" → "F17"; Arabic:
  // "خريف 2017/2018" → "خ17". Falls back to the full label when no term/year
  // pattern matches.
  const shortSemesterLabel = (label: string): string => {
    const yearMatch = label.match(/(\d{4})/);
    const yy = yearMatch ? yearMatch[1].slice(2) : "";
    const isArabicSrc = /[\u0600-\u06FF]/.test(label);
    // Detect term type from either language
    let term: "F" | "S" | "SU" | "W" | null = null;
    if (/Fall|Autumn|خريف/i.test(label)) term = "F";
    else if (/Spring|ربيع/i.test(label)) term = "S";
    else if (/Summer|صيف/i.test(label)) term = "SU";
    else if (/Winter|شتاء/i.test(label)) term = "W";
    if (!term) return label;
    // Render in the active interface language, not the source language
    if (lang === "ar") {
      const map = { F: "خ", S: "ر", SU: "ص", W: "ش" } as const;
      return `${map[term]}${yy}`;
    }
    return `${term}${yy}`;
    void isArabicSrc;
  };

  const chartData = report.semesters.map((s, i) => ({
    name: shortSemesterLabel(s.label || `S${i + 1}`),
    fullName: s.label || `S${i + 1}`,
    [t.gpaLegend]: s.gpa,
    [t.cgpaLegend]: s.cgpa,
  }));

  // Calculate counted semesters: enrolled + not summer + not counted as summer
  const countedSemesters = report.semesters.filter(
    (s) => isEnrolledStatus(s.status) && s.termType !== "summer" && !s.countedAsSummer
  ).length;

  const remainingCountedSemesters = 20 - countedSemesters;

  return (
    <section id="report" className="mx-auto max-w-7xl px-4 sm:px-6 pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t.reportHeader}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold mt-1">
            {report.studentName ?? t.standing}
          </h2>
          {report.program && (
            <p className="text-muted-foreground mt-1">{report.program}</p>
          )}
        </div>
        <div className={`rounded-lg border px-4 py-3 ${risk.bg}`}>
          <div className="flex items-center gap-2">
            <RiskIcon className={`h-5 w-5 ${risk.tone}`} />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t.riskLevel}
              </div>
              <div className={`font-display font-semibold ${risk.tone}`}>{risk.label[lang]}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Withdrawal alert */}
      {report.withdrawalRecommended && (
        <Card className="p-6 border-destructive/40 bg-destructive/5">
          <div className="flex items-start gap-4">
            <ShieldAlert className="h-6 w-6 text-destructive shrink-0 mt-1" />
            <div>
              <h3 className="font-display text-xl font-semibold text-destructive">
                {t.notRegisterTitle}
              </h3>
              <p className="text-sm mt-2 text-foreground/85">
                {t.notRegisterBody.replace("{n}", String(report.warningSemesterCount))}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-4">
        <Stat label={t.cgpa} value={report.cgpa?.toFixed(2) ?? "—"} accent />
        <Stat label={t.currentGpa} value={report.currentGPA?.toFixed(2) ?? "—"} />
        <Stat
          label={t.warningSems}
          value={report.warningSemesterCount.toString()}
          tone={report.warningSemesterCount > 0 ? "text-[color:var(--warning)]" : undefined}
        />
        <Stat
          label={t.remaining}
          value={report.remainingSemesters.toString()}
          tone={
            report.remainingSemesters <= 1
              ? "text-destructive"
              : report.remainingSemesters <= 3
                ? "text-[color:var(--warning)]"
                : "text-[color:var(--success)]"
          }
        />
        <Stat
          label={t.countedSems}
          value={countedSemesters.toString()}
          tone={
            countedSemesters >= 20
              ? "text-destructive"
              : countedSemesters >= 18
                ? "text-[color:var(--warning)]"
                : "text-[color:var(--success)]"
          }
        />
        <Stat
          label={t.remainingCountedSems}
          value={remainingCountedSemesters.toString()}
          tone={
            remainingCountedSemesters <= 0
              ? "text-destructive"
              : remainingCountedSemesters <= 2
                ? "text-[color:var(--warning)]"
                : "text-[color:var(--success)]"
          }
        />
        <Stat label={t.suggestedLoad} value={`${report.suggestedCreditLoad} ${t.cr}`} />
      </div>

      {/* Chart + Risk gauge */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-accent" /> {t.gpaProgression}
          </h3>
          <div className="h-80 mt-4" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  fontSize={10}
                  interval={0}
                  angle={chartData.length > 8 ? -40 : 0}
                  textAnchor={chartData.length > 8 ? "end" : "middle"}
                  height={chartData.length > 8 ? 72 : 48}
                  label={{
                    value: t.axisSemesters,
                    position: "insideBottom",
                    offset: -16,
                    fill: "var(--color-muted-foreground)",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  domain={[0, 4]}
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  ticks={[0, 1, 2, 3, 4]}
                />
                <Tooltip
                  labelFormatter={(_label, payload) =>
                    payload && payload[0] && (payload[0].payload as { fullName?: string })?.fullName
                      ? (payload[0].payload as { fullName: string }).fullName
                      : String(_label)
                  }
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
                />
                <ReferenceLine
                  y={2}
                  stroke="var(--color-destructive)"
                  strokeDasharray="4 4"
                  label={{ value: "Min 2.00", fill: "var(--color-destructive)", fontSize: 10 }}
                />
                <Line
                  type="monotone"
                  dataKey={t.gpaLegend}
                  name={t.gpaLegend}
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey={t.cgpaLegend}
                  name={t.cgpaLegend}
                  stroke="var(--color-chart-2)"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>


        <Card className="p-6">
          <h3 className="font-display text-lg font-semibold">{t.riskForecast}</h3>
          <div className="mt-5">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{t.riskScore}</span>
              <span className="font-medium">{report.riskScore}/100</span>
            </div>
            <Progress value={report.riskScore} className="h-2" />
          </div>
          <div className="mt-6 space-y-3 text-sm">
            <Row label={t.dismissalNext} value={report.predictedNextSemesterDismissal ? t.likely : t.unlikely} danger={report.predictedNextSemesterDismissal} />
            <Row label={t.warningStreak} value={`${report.warningSemesterCount} / 6`} danger={report.warningSemesterCount >= 3} />
            <Row label={t.remaining} value={`${report.remainingSemesters}`} danger={report.remainingSemesters <= 1} />
            <Row label={t.remainingCountedSems} value={`${remainingCountedSemesters}`} danger={remainingCountedSemesters <= 0} />
            <Row label={t.failedCount} value={`${report.failedCourses.length}`} danger={report.failedCourses.length > 0} />
          </div>
          <p className="mt-5 text-sm text-foreground/80 leading-relaxed">{report.summary}</p>
        </Card>
      </div>

      {/* AI Recommendations */}
      <Card className="p-6" style={{ background: "var(--gradient-hero)", color: "white" }}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <h3 className="font-display text-xl font-semibold">{t.aiRecs}</h3>
          {aiLoading && (
            <span className="text-xs opacity-80 ms-2">{t.aiRecsLoading}</span>
          )}
        </div>
        {aiError && !report.aiNarrativeAvailable && (
          <div className="mt-4 rounded-md bg-white/10 backdrop-blur p-3 text-sm">
            {t.aiRecsUnavailable}
          </div>
        )}
        <ul className="mt-4 grid sm:grid-cols-2 gap-3">
          {report.recommendations.map((r, i) => (
            <li key={i} className="flex gap-3 bg-white/10 rounded-md p-3 backdrop-blur">
              <span className="text-accent text-lg leading-none">→</span>
              <span className="text-sm">{r}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Warnings + Failed Courses */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[color:var(--warning)]" /> {t.warnings}
          </h3>
          {report.warnings.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">{t.noWarnings}</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {report.warnings.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[color:var(--warning)]">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" /> {t.failedCoursesTitle}
          </h3>
          {report.failedCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">{t.noneKeepUp}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-start py-2 pe-3">{t.code}</th>
                    <th className="text-start py-2 pe-3">{t.course}</th>
                    <th className="text-end py-2 pe-3">{t.crShort}</th>
                    <th className="text-end py-2">{t.grade}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.failedCourses.map((c, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pe-3 font-mono">{c.code}</td>
                      <td className="py-2 pe-3">{c.name}</td>
                      <td className="py-2 pe-3 text-end">{c.credits}</td>
                      <td className="py-2 text-end font-semibold text-destructive">{c.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Semester breakdown */}
      <div>
        <h3 className="font-display text-2xl font-semibold flex items-center gap-2 mb-4">
          <BookOpen className="h-5 w-5 text-accent" /> {t.semesterBreakdown}
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          {report.semesters.map((s, i) => (
            <SemesterCard key={i} semester={s} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: string;
}) {
  return (
    <Card
      className="p-5"
      style={accent ? { background: "var(--gradient-gold)", color: "var(--accent-foreground)" } : undefined}
    >
      <div
        className={`text-[10px] uppercase tracking-[0.2em] ${
          accent ? "text-accent-foreground/70" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className={`font-display text-3xl font-semibold mt-1 ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${danger ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

function SemesterCard({
  semester: s,
  t,
}: {
  semester: AdvisorReport["semesters"][number];
  t: TStrings;
}) {
  const isSummerLike = s.countedAsSummer;
  const isCounted = isEnrolledStatus(s.status) && s.termType !== "summer" && !s.countedAsSummer;
  
  // Strip status from label (remove anything in parentheses at the end)
  const cleanLabel = s.label.replace(/\s*\([^)]*\)\s*$/, "");
  
  return (
    <Card
      className={`p-5 ${
        s.isWarningSemester
          ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/5"
          : s.resetThisSemester
            ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/5"
            : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-lg font-semibold">{cleanLabel}</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mt-0.5">
            {s.termType} · {s.credits} {t.credits} · {s.status ?? "Enrolled"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {s.isWarningSemester && (
            <Badge className="bg-[color:var(--warning)] text-background hover:bg-[color:var(--warning)]">
              {t.warningBadge}{s.warningCount}
            </Badge>
          )}
          {s.resetThisSemester && (
            <Badge className="bg-[color:var(--success)] text-background hover:bg-[color:var(--success)]">
              {t.resetBadge}
            </Badge>
          )}
          {isSummerLike && !s.isWarningSemester && !s.resetThisSemester && (
            <Badge variant="outline">{t.summerBadge}</Badge>
          )}
          {isCounted ? (
            <Badge variant="outline">{t.countedBadge}</Badge>
          ) : (
            <Badge variant="outline">{t.notEnrolledBadge}</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-md bg-muted/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.currentGpa}</div>
          <div
            className={`font-display text-2xl font-semibold ${
              s.gpa === null ? "" : s.gpa < 2 ? "text-destructive" : "text-emerald-500"
            }`}
          >
            {s.gpa?.toFixed(2) ?? "—"}
          </div>
        </div>
        <div className="rounded-md bg-muted/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.cgpa}</div>
          <div
            className={`font-display text-2xl font-semibold ${
              s.cgpa === null ? "" : s.cgpa < 2 ? "text-destructive" : "text-emerald-500"
            }`}
          >
            {s.cgpa?.toFixed(2) ?? "—"}
          </div>
        </div>
      </div>

      <details className="mt-4 group">
        <summary className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground">
          {s.courses.length} {t.courses} ▾
        </summary>
        <ul className="mt-3 space-y-1.5 text-sm">
          {s.courses.map((c, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">
                <span className="font-mono text-xs text-muted-foreground mr-2">{c.code}</span>
                {c.name}
              </span>
              <span
                className={`font-semibold ${
                  c.passed ? "text-foreground" : "text-destructive"
                }`}
              >
                {c.grade}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}