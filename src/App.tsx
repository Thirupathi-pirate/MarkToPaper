import React, { useState, useRef } from "react";
import { 
  FileText, 
  Copy, 
  Check, 
  Trash2, 
  ArrowRight,
  ShieldAlert,
  Loader2,
  Sparkles,
  GraduationCap,
  FileUp,
  X,
  Download,
  ChevronDown,
  Moon,
  Sun,
  FileCode2,
  CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import copy from "copy-to-clipboard";
import { cn } from "./lib/utils";
import { checkAiStatus, generateContent, generateScholarThoughts, type GenerationResult } from "./services/geminiService";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';

import mermaid from "mermaid";

// Add Mermaid Initialization
if (typeof window !== "undefined") {
  mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'Inter, sans-serif',
  });
}

const Mermaid = React.memo(({ chart }: { chart: string }) => {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  React.useEffect(() => {
    let isMounted = true;
    if (chart) {
      setIsProcessing(true);
      const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
      
      // Use clean chart string
      const cleanChart = chart.trim();
      
      mermaid.render(id, cleanChart)
        .then(({ svg: generatedSvg }) => {
          if (isMounted) {
            setSvg(generatedSvg);
            setError(false);
            setIsProcessing(false);
          }
        })
        .catch((err) => {
          console.error("Mermaid rendering failed:", err);
          if (isMounted) {
            setError(true);
            setIsProcessing(false);
          }
        });
    }
    return () => { isMounted = false; };
  }, [chart]);

  if (error) {
    return (
      <div className="p-4 border border-red-500/20 bg-red-500/5 text-red-500 text-[10px] uppercase font-bold text-center my-4 rounded">
        Invalid Mermaid Syntax
      </div>
    );
  }

  return (
    <div 
      className="mermaid-rendered flex justify-center my-6 overflow-x-auto bg-white p-4 rounded-lg shadow-sm w-full min-h-[100px] transition-opacity duration-300" 
      style={{ opacity: isProcessing ? 0.5 : 1 }}
      dangerouslySetInnerHTML={{ __html: svg || '<div class="flex items-center justify-center h-24 w-full text-[10px] uppercase tracking-widest text-[#8C887D] animate-pulse">Rendering Diagram...</div>' }} 
    />
  );
});
Mermaid.displayName = "Mermaid";

const MarkdownContent = React.memo(({ content, theme }: { content: string, theme: string }) => {
  return (
    <div className={cn("prose prose-sm max-w-none transition-colors", theme === 'dark' ? "prose-invert" : "")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-mermaid/.exec(className || "");
            return !inline && match ? (
              <Mermaid chart={String(children).replace(/\n$/, "")} />
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          hr: () => <hr className="my-10 border-[#D1CEC5] dark:border-white/10" />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
MarkdownContent.displayName = "MarkdownContent";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GenerationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(45); // Estimated seconds
  const [statusMessage, setStatusMessage] = useState("Initializing Engine...");
  const [selectedModel, setSelectedModel] = useState("default");
  const [subject, setSubject] = useState<'physics' | 'chemistry' | 'maths' | 'mixed' | 'other'>('other');
  const [questionRange, setQuestionRange] = useState<string>("1-225");
  const [scienceRange, setScienceRange] = useState<string>("1-100");
  const [mathRange, setMathRange] = useState<string>("101-225");
  const [batchSize, setBatchSize] = useState<number>(25);
  const [aiStatus, setAiStatus] = useState<'idle' | 'checking' | 'active' | 'error'>('idle');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [logs, setLogs] = useState<{stage: string, percent: number, time: Date}[]>([]);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState<'workspace' | 'memory'>('workspace');
  const [memory, setMemory] = useState<{id: string, date: number, name: string, results: GenerationResult}[]>([]);
  const [dynamicThought, setDynamicThought] = useState("Initializing neural buffers...");
  const [thoughtPool, setThoughtPool] = useState<string[]>([]);
  const usedThoughtsRef = useRef<Set<string>>(new Set());
  
  // Rotating thoughts effect
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isGenerating) {
      // Rotate thought every 12 seconds
      interval = setInterval(() => {
        if (thoughtPool.length > 0) {
          const next = thoughtPool[Math.floor(Math.random() * thoughtPool.length)];
          setDynamicThought(next);
          usedThoughtsRef.current.add(next);
        }
      }, 12000);
    } else {
      // Default idle thought
      setDynamicThought("The beautiful thing about learning is that no one can take it away from you.");
    }

    return () => clearInterval(interval);
  }, [isGenerating, thoughtPool]);

  // Refill thought pool effect
  React.useEffect(() => {
    if (isGenerating && thoughtPool.length < 3) {
      (async () => {
        try {
          const newThoughts = await generateScholarThoughts(Array.from(usedThoughtsRef.current));
          setThoughtPool(prev => [...new Set([...prev, ...newThoughts])]);
        } catch (e) {
          console.error("Failed to refill thoughts", e);
        }
      })();
    }
  }, [isGenerating, thoughtPool.length]);
  const sortedMemory = React.useMemo(() => [...memory].sort((a, b) => b.date - a.date), [memory]);

  const loadSampleCase = () => {
    const sample: GenerationResult = {
      formattedExam: `**Q1.** Calculate the derivative of $f(x) = x^2 \\cdot e^x$.
      
(A) $x^2 e^x + 2xe^x$
(B) $x^2 e^x - 2xe^x$
(C) $2xe^x$
(D) $x^2 e^x$

**Answer: (A)** | **Difficulty:** Moderate

---

**Q2.** Identify the components of a simple circuit.

\`\`\`mermaid
flowchart LR
    A[Battery] --> B[Switch]
    B --> C[Resistor]
    C --> D[LED]
    D --> A
    
    style A fill:#f9f,stroke:#333,stroke-width:4px
    style D fill:#00ff00,stroke:#333
\`\`\`

**Answer: (N/A)** | **Difficulty:** Simple

---

**Q3.** Solve for $\\theta$:
$$2\\sin^2\\theta + \\sqrt{3}\\cos\\theta + 1 = 0$$

**Answer: (\\pi/6)** | **Difficulty:** Difficult`,
      solutionManual: `**Q1. Answer: (A)** | **Difficulty:** Moderate
* **Concept:** Product Rule for differentiation.
* **Formula:** $\\frac{d}{dx}[u \\cdot v] = u'v + uv'$.
* **Calculation:**
  Let $u = x^2$ and $v = e^x$.
  Then $u' = 2x$ and $v' = e^x$.
  $$f'(x) = (2x)(e^x) + (x^2)(e^x) = e^x(x^2 + 2x)$$

---

**Q2. Answer: (N/A)** | **Difficulty:** Simple
* **Analysis:** The diagram shows a closed loop system.
* **Component Roles:** 
  - **Battery:** Power source.
  - **Switch:** Control element.
  - **LED:** Output indicator.

---

**Q3. Answer: (\\pi/6)** | **Difficulty:** Difficult
* **Concept:** Trigonometric substitution.
* **Step:** Replace $\\sin^2\\theta$ with $1 - \\cos^2\\theta$.
  $$2(1 - \\cos^2\\theta) + \\sqrt{3}\\cos\\theta + 1 = 0$$
  $$2 - 2\\cos^2\\theta + \\sqrt{3}\\cos\\theta + 1 = 0$$
  $$2\\cos^2\\theta - \\sqrt{3}\\cos\\theta - 3 = 0$$`
    };
    setResults(sample);
    setTimeout(() => setShowPreview(true), 100);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);

  React.useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

    
  const formatTime = React.useCallback((seconds: number) => {
    if (seconds < 60) return seconds + 's';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + 'm ' + s + 's';
  }, []);

  const getActualModel = React.useCallback(() => {
    if (selectedModel === 'default') {
      if (subject === 'maths') return "gemini-3.1-pro-preview";
      if (subject === 'physics' || subject === 'chemistry') return "gemini-3-flash-preview";
      return "gemini-3-flash-preview"; // Default fallback
    }
    return selectedModel;
  }, [selectedModel, subject]);

  // Load state from local storage on mount
  React.useEffect(() => {
    const savedState = localStorage.getItem('stemScholarState');
    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        const now = Date.now();
        const timestamp = parsedState.timestamp || 0;
        const twoDays = 48 * 60 * 60 * 1000;

        // Check if stored memory is older than two days
        if (now - timestamp > twoDays) {
          console.log("Memory expired, clearing local storage.");
          localStorage.removeItem('stemScholarState');
          return;
        }

        if (parsedState.questionRange) setQuestionRange(parsedState.questionRange);
        if (parsedState.scienceRange) setScienceRange(parsedState.scienceRange);
        if (parsedState.mathRange) setMathRange(parsedState.mathRange);
        if (parsedState.batchSize) setBatchSize(parsedState.batchSize);
        if (parsedState.selectedModel) setSelectedModel(parsedState.selectedModel);
        if (parsedState.subject) setSubject(parsedState.subject);
        if (parsedState.theme) setTheme(parsedState.theme);
        if (parsedState.results) setResults(parsedState.results);
        if (parsedState.history) setMemory(parsedState.history);
        if (parsedState.timestamp) setLastSaved(parsedState.timestamp);
      } catch (e) {
        console.error("Failed to restore state", e);
      }
    }
  }, []);

  // Update body class class when theme changes
  React.useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Save state to local storage when relevant items change (debounced)
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      const ts = Date.now();
      const stateToSave = {
        questionRange,
        scienceRange,
        mathRange,
        batchSize,
        selectedModel,
        subject,
        theme,
        results,
        history: memory,
        timestamp: ts
      };
      try {
        localStorage.setItem('stemScholarState', JSON.stringify(stateToSave));
        setLastSaved(ts);
      } catch (e: any) {
        // If results exceed local storage quota (usually ~5MB), try saving without results
        if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          console.warn("Storage quota exceeded, saving settings ONLY without results.");
          const settingsOnly = { ...stateToSave, results: null };
          localStorage.setItem('stemScholarState', JSON.stringify(settingsOnly));
        } else {
          console.warn("Could not save to local storage", e);
        }
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [questionRange, scienceRange, mathRange, batchSize, selectedModel, subject, theme, results, memory]);

  const statusStages = [
    "Uploading Document...",
    "Extracting Content...",
    "Generating Questions...",
    "Generating Solutions...",
    "Finalizing Document..."
  ];

  const handleFileChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "application/pdf") {
        setError("Only PDF files are supported.");
        return;
      }
      setFile(selectedFile);
      setError(null);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        setPdfBase64(base64String);
      };
      reader.readAsDataURL(selectedFile);
    }
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (!pdfBase64) {
      setError("Please upload a PDF exam paper first.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setLogs([]);
    
    let totalQuestions = 0;
    if (subject === 'mixed') {
       let sStart = 1, sEnd = 100, mStart = 101, mEnd = 225;
       if (scienceRange.includes('-')) { const p = scienceRange.split('-'); sStart = parseInt(p[0])||1; sEnd = parseInt(p[1])||sStart; }
       if (mathRange.includes('-')) { const p = mathRange.split('-'); mStart = parseInt(p[0])||1; mEnd = parseInt(p[1])||mStart; }
       totalQuestions = Math.max(1, sEnd - sStart + 1) + Math.max(1, mEnd - mStart + 1);
    } else {
       let rangeStart = 1, rangeEnd = 225;
       if (questionRange.includes('-')) {
         const parts = questionRange.split('-');
         rangeStart = parseInt(parts[0].trim(), 10) || 1;
         rangeEnd = parseInt(parts[1].trim(), 10) || rangeStart;
       } else {
         rangeEnd = parseInt(questionRange.trim(), 10) || 225;
         rangeStart = 1;
       }
       totalQuestions = Math.max(1, rangeEnd - rangeStart + 1);
    }
    
    const numBatches = Math.ceil(totalQuestions / batchSize);
    const calculatedInitialTime = Math.max(15, numBatches * 15 + 10); 
    setEstimatedTime(calculatedInitialTime);
    startTimeRef.current = Date.now();
    
    const updateTimeEstimate = (percent: number) => {
      if (percent > 0 && percent < 100) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const estimatedTotal = (elapsed / percent) * 100;
        const remaining = Math.round(Math.max(1, estimatedTotal - elapsed));
        setEstimatedTime(prev => {
          // If we just started, trust the new estimate
          if (percent < 5) return remaining;
          // Smooth the update: only adjust if significantly different or if decreasing
          if (remaining < prev || Math.abs(remaining - prev) > 10) {
            return remaining;
          }
          return prev;
        });
      }
    };

    // Visual countdown
    const timer = setInterval(() => {
      setEstimatedTime(prev => Math.max(0, prev - 1));
    }, 1000);

    try {
      if (subject === 'mixed') {
        const sciData = await generateContent(
          pdfBase64,
          "gemini-3-flash-preview",
          scienceRange,
          batchSize,
          (stage, percent) => {
            const effectivePercent = Math.floor(percent / 2);
            setStatusMessage(`[Science] ${stage}`);
            setProgress(effectivePercent);
            setLogs(prev => [...prev, { stage: `[Science] ${stage}`, percent: effectivePercent, time: new Date() }]);
            updateTimeEstimate(effectivePercent);
          },
          'physics',
          (partial) => {
            if (partial.examChunks || partial.solutionChunks) {
               setResults(prev => {
                 const current = prev || { formattedExam: '', solutionManual: '' };
                 return {
                   formattedExam: partial.examChunks ? partial.examChunks.filter(Boolean).join('\n\n').trim() : current.formattedExam,
                   solutionManual: partial.solutionChunks ? partial.solutionChunks.filter(Boolean).join('\n\n').trim() : current.solutionManual
                 };
               });
            }
          }
        );
        const mathData = await generateContent(
          pdfBase64,
          "gemini-3.1-pro-preview",
          mathRange,
          batchSize,
          (stage, percent) => {
            const effectivePercent = 50 + Math.floor(percent / 2);
            setStatusMessage(`[Maths] ${stage}`);
            setProgress(effectivePercent);
            setLogs(prev => [...prev, { stage: `[Maths] ${stage}`, percent: effectivePercent, time: new Date() }]);
            updateTimeEstimate(effectivePercent);
          },
          'maths',
          (partial) => {
            if (partial.examChunks || partial.solutionChunks) {
               setResults(prev => {
                 const current = prev || { formattedExam: '', solutionManual: '' };
                 const sciExam = sciData.formattedExam;
                 const sciSol = sciData.solutionManual;
                 return {
                   formattedExam: sciExam + "\n\n---\n\n" + (partial.examChunks ? partial.examChunks.filter(Boolean).join('\n\n').trim() : ''),
                   solutionManual: sciSol + "\n\n---\n\n" + (partial.solutionChunks ? partial.solutionChunks.filter(Boolean).join('\n\n').trim() : '')
                 };
               });
            }
          }
        );

        const finalResults = {
          formattedExam: sciData.formattedExam + "\n\n---\n\n" + mathData.formattedExam,
          solutionManual: sciData.solutionManual + "\n\n---\n\n" + mathData.solutionManual
        };
        setResults(finalResults);
        
        // Add to history
        const newHistoryItem = {
          id: Date.now().toString(),
          date: Date.now(),
          name: file?.name || "Untitled Conversion",
          results: finalResults
        };
        setMemory(prev => [newHistoryItem, ...prev]);
        
        setProgress(100);
        setEstimatedTime(0);
        setLogs(prev => [...prev, { stage: "Finalizing Solutions... Complete!", percent: 100, time: new Date() }]);
      } else {
        const data = await generateContent(
          pdfBase64, 
          getActualModel(), 
          questionRange, 
          batchSize, 
          (stage, percent) => {
            setStatusMessage(stage);
            setProgress(prev => Math.max(prev, percent));
            setLogs(prev => [...prev, { stage, percent, time: new Date() }]);
            updateTimeEstimate(percent);
          },
          subject,
          (partial) => {
            if (partial.examChunks || partial.solutionChunks) {
               setResults(prev => {
                 const current = prev || { formattedExam: '', solutionManual: '' };
                 return {
                   formattedExam: partial.examChunks ? partial.examChunks.filter(Boolean).join('\n\n').trim() : current.formattedExam,
                   solutionManual: partial.solutionChunks ? partial.solutionChunks.filter(Boolean).join('\n\n').trim() : current.solutionManual
                 };
               });
            }
          }
        );
        setResults(data);
        
        // Add to history
        const newHistoryItem = {
          id: Date.now().toString(),
          date: Date.now(),
          name: file?.name || "Untitled Conversion",
          results: data
        };
        setMemory(prev => [newHistoryItem, ...prev]);
        
        setProgress(100);
        setEstimatedTime(0);
        setLogs(prev => [...prev, { stage: "Finalizing Solutions... Complete!", percent: 100, time: new Date() }]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to process the document. Ensure it's a valid PDF and try again.");
      console.error(err);
    } finally {
      clearInterval(timer);
      setIsGenerating(false);
    }
  }, [pdfBase64, subject, scienceRange, mathRange, questionRange, batchSize, file, getActualModel]);

  const handleDownloadPdf = React.useCallback(async (theme: 'light' | 'dark', content: 'both' | 'exam' | 'solutions' = 'both') => {
    if (isExporting) return;
    
    setIsExporting(true);

    // Let React render the spinner and update the DOM
    await new Promise(r => setTimeout(r, 100)); 

    const downloadSingle = async (contentType: 'exam' | 'solutions') => {
      const baseName = file?.name ? file.name.replace(/\.[^/.]+$/, "") : `STEM_Scholar`;
      let suffix = contentType === 'exam' ? 'questions' : 'solutions';
      const filename = `${baseName} ${suffix}.pdf`;

      const dateStr = new Date().toLocaleDateString();
      let mdContent = '';
      
      if (contentType === 'exam') {
        mdContent += `# Exam Questions\n*Generated by STEM Scholar on ${dateStr}*\n\n---\n\n${results?.formattedExam}\n\n`;
      } else {
        mdContent += `# Exam Solutions\n*Generated by STEM Scholar on ${dateStr}*\n\n---\n\n${results?.solutionManual}\n\n`;
      }

      const performFetch = async (retries = 1): Promise<void> => {
        try {
          const response = await fetch('/api/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown: mdContent, theme })
          });

          if (!response.ok) {
            let errorMsg = "PDF generation failed";
            try {
              const errData = await response.json();
              errorMsg = errData.message || errData.error || errData.details || errorMsg;
            } catch (e) {
              errorMsg = await response.text() || errorMsg;
            }
            throw new Error(errorMsg);
          }

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          
          setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
          }, 100);
        } catch (err: any) {
          if (retries > 0 && (err.message === 'Failed to fetch' || err.name === 'TypeError')) {
             console.warn("Retrying PDF fetch...");
             await new Promise(r => setTimeout(r, 2000));
             return performFetch(retries - 1);
          }
          throw err;
        }
      };

      try {
        await performFetch();
      } catch (err: any) {
        console.error(`PDF Export Error (${contentType}):`, err);
        const errorDetail = err.message || "Unknown error";
        setError(`Failed to convert Markdown to PDF: ${errorDetail}. Contact support if this persists.`);
      }
    };

    if (content === 'both') {
      await downloadSingle('exam');
      // Small delay to ensure browser handles multiple downloads smoothly
      await new Promise(r => setTimeout(r, 800));
      await downloadSingle('solutions');
    } else {
      await downloadSingle(content as 'exam' | 'solutions');
    }

    setIsExporting(false);
  }, [isExporting, file, results]);

  const downloadMdFile = React.useCallback((text: string, type: string) => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.body.appendChild(document.createElement('a'));
    link.href = url;
    const baseName = file?.name ? file.name.replace(/\.[^/.]+$/, "") : `STEM_Scholar`;
    const suffix = type === 'Exam' ? 'questions' : 'solutions';
    link.download = `${baseName} ${suffix}.md`;
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }, [file]);

  const handleDownloadMd = React.useCallback(async (content: 'both' | 'exam' | 'solutions' = 'both') => {
    const dateStr = new Date().toLocaleDateString();

    if (content === 'both' || content === 'exam') {
      const examMd = `# Exam Questions\n*Generated by STEM Scholar on ${dateStr}*\n\n---\n\n${results?.formattedExam}`;
      downloadMdFile(examMd, 'Exam');
    }

    if (content === 'both') await new Promise(r => setTimeout(r, 500));

    if (content === 'both' || content === 'solutions') {
      const solMd = `# Exam Solutions\n*Generated by STEM Scholar on ${dateStr}*\n\n---\n\n${results?.solutionManual}`;
      downloadMdFile(solMd, 'Solutions');
    }
  }, [results, downloadMdFile]);

  const handleCopy = React.useCallback((text: string) => {
    copy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const clearWorkspace = React.useCallback(() => {
    setFile(null);
    setPdfBase64(null);
    setResults(null);
    setError(null);
    setProgress(0);
    setAiStatus('idle');
    setViewMode('workspace');
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const deleteMemoryItem = React.useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMemory(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleCheckStatus = React.useCallback(async () => {
    setAiStatus('checking');
    setError(null);
    try {
      const isActive = await checkAiStatus(getActualModel());
      setAiStatus(isActive ? 'active' : 'error');
      
      if (isActive) {
        setTimeout(() => setAiStatus('idle'), 3000);
      } else {
        setError("AI check failed to respond. The model might be busy.");
      }
    } catch (e: any) {
      setAiStatus('error');
      setError(e.message || "An error occurred connecting to the model.");
    }
  }, [getActualModel]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (droppedFile.type !== "application/pdf") {
        setError("Only PDF files are supported.");
        return;
      }
      setFile(droppedFile);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        setPdfBase64(base64String);
      };
      reader.readAsDataURL(droppedFile);
    }
  };

  return (
    <div className={cn("min-h-[100dvh] lg:h-screen transition-colors duration-500", theme === 'dark' ? 'dark bg-[#1A1A1A] text-white' : 'bg-[#F9F7F2] text-[#1A1A1A]')}>
      <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col lg:flex-row h-full relative pt-16 lg:pt-0"
        >
          <AnimatePresence>
            {isGenerating && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed top-0 left-0 w-full h-1.5 bg-transparent z-[70] flex"
              >
                <motion.div className="h-full bg-[#1A1A1A] dark:bg-white"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear", duration: 0.5 }}
                />
              </motion.div>
            )}
          </AnimatePresence>
      {/* Left Panel: Sidebar / Workspace */}
      {viewMode === 'workspace' && (
        <aside className={cn(
          "w-full lg:w-[420px] lg:h-full border-b lg:border-b-0 lg:border-r border-[#D1CEC5] dark:border-white/10 flex flex-col p-6 lg:pt-28 lg:pb-10 lg:px-10 shrink-0 lg:overflow-y-auto transition-colors duration-500",
          theme === 'dark' ? 'bg-[#121212] text-[#E7E5E4]' : 'bg-[#F9F7F2] text-[#1A1A1A]'
        )}>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.08 }
              }
            }}
            className="flex flex-col h-full"
          >
            <motion.header 
              variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}
              className="mb-10 lg:mb-14 text-center lg:text-left"
            >
              <div className={cn("text-[10px] uppercase tracking-[0.2em] font-bold mb-3 flex items-center justify-center lg:justify-start gap-2", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>
                <GraduationCap className="w-4 h-4" />
                The Specialized Processor
              </div>
              <h1 className={cn("text-4xl lg:text-5xl font-serif italic leading-tight", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}>
                STEM<br />Scholar.
              </h1>
            </motion.header>

            <div className="flex-1 flex flex-col space-y-8">
              {/* Mode Info */}
              <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }} className="space-y-3">
                <label className={cn("text-[11px] uppercase tracking-widest font-bold block", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Processing Module</label>
                <div className={cn("px-5 py-4 border flex justify-between items-center text-sm font-bold shadow-sm transition-colors", theme === 'dark' ? "border-white/20 bg-white/5 text-white" : "border-[#1A1A1A] bg-[#1A1A1A] text-white")}>
                  <span>PDF-to-Exam</span>
                  <span className="text-[9px] opacity-60 bg-white/20 px-1.5 py-0.5 rounded uppercase tracking-tighter">Active</span>
                </div>
              </motion.div>

              {/* Subject Selection */}
              <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }} className="space-y-3">
                <label className={cn("text-[11px] uppercase tracking-widest font-bold block", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Subject Area</label>
                <div className="relative">
                  <select 
                    value={subject}
                    onChange={(e) => setSubject(e.target.value as any)}
                    disabled={isGenerating}
                    className={cn(
                      "w-full border p-3 text-sm font-bold focus:outline-none transition-colors appearance-none cursor-pointer disabled:opacity-50",
                      theme === 'dark' ? "bg-white/5 text-white border-white/20 focus:border-white/50" : "bg-white text-[#1A1A1A] border-[#D1CEC5] focus:border-[#1A1A1A]"
                    )}
                  >
                    <option value="other">General / Other</option>
                    <option value="maths">Mathematics (Optimized for 3.1 Pro)</option>
                    <option value="physics">Physics (Flash Optimized)</option>
                    <option value="chemistry">Chemistry (Flash Optimized)</option>
                    <option value="mixed">Mixed (Physics/Chem & Maths)</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                </div>
              </motion.div>

              {/* Model Selection */}
              <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }} className="space-y-3">
                <label className={cn("text-[11px] uppercase tracking-widest font-bold block", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Neural Engine</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select 
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={isGenerating}
                      className={cn(
                        "w-full border p-3 text-sm font-bold focus:outline-none transition-colors appearance-none cursor-pointer disabled:opacity-50",
                        theme === 'dark' ? "bg-white/5 text-white border-white/20 focus:border-white/50" : "bg-white text-[#1A1A1A] border-[#D1CEC5] focus:border-[#1A1A1A]"
                      )}
                    >
                      <option value="default" className="text-black">Default (Auto-Select Based on Subject)</option>
                      <option value="gemini-2.5-flash" className="text-black">Gemini 2.5 Flash</option>
                      <option value="gemini-2.5-pro" className="text-black">Gemini 2.5 Pro</option>
                      <option value="gemini-2.0-flash" className="text-black">Gemini 2.0 Flash</option>
                      <option value="gemini-2.0-pro-exp" className="text-black">Gemini 2.0 Pro Exp</option>
                      <option value="gemini-flash-latest" className="text-black">Gemini Flash Latest</option>
                      <option value="gemini-3-flash-preview" className="text-black">Gemini 3 Flash (Preview)</option>
                      <option value="gemini-3.1-pro-preview" className="text-black">Gemini 3.1 Pro (Preview)</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                      <ArrowRight className="w-4 h-4 rotate-90" />
                    </div>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCheckStatus}
                    disabled={isGenerating || aiStatus === 'checking'}
                    className={cn(
                      "px-4 border transition-all disabled:opacity-30 group relative flex items-center justify-center min-w-[50px]",
                      theme === 'dark' ? "bg-white/5 border-white/20 hover:bg-white/10" : "bg-white border-[#1A1A1A] hover:bg-[#F9F7F2]"
                    )}
                    title="Verify AI Connection"
                  >
                    {aiStatus === 'checking' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <div className="relative">
                        <Sparkles className={cn("w-4 h-4 transition-colors", aiStatus === 'active' ? "text-green-600" : "text-[#1A1A1A]")} />
                        {aiStatus === 'active' && (
                          <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                          </span>
                        )}
                        {aiStatus === 'error' && (
                          <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                        )}
                      </div>
                    )}
                  </motion.button>
                </div>
                
                {aiStatus === 'active' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-[9px] text-green-700 font-bold uppercase tracking-[0.1em] px-1"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                    AI Connected
                  </motion.div>
                )}
                
                {aiStatus === 'error' && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-[9px] text-red-600 font-bold uppercase tracking-[0.1em] px-1"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Connection failed
                  </motion.div>
                )}
              </motion.div>

              {/* Batch Settings */}
              {subject === 'mixed' ? (
                <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }} className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-[#8C887D]">Sciences (Flash Model) Range</label>
                    <input 
                      type="text"
                      value={scienceRange}
                      onChange={(e) => setScienceRange(e.target.value)}
                      placeholder="e.g. 1-100"
                      disabled={isGenerating}
                      className={cn(
                        "w-full border p-3 text-sm font-bold focus:outline-none transition-colors disabled:opacity-50",
                        theme === 'dark' 
                          ? "bg-white/5 text-[#F9F7F2] border-white/10 focus:border-[#F9F7F2]/50 placeholder:text-[#F9F7F2]/30" 
                          : "bg-white text-[#1A1A1A] border-[#D1CEC5] focus:border-[#1A1A1A] placeholder:text-[#8C887D]/50"
                      )}
                    />
                  </div>
                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-[#8C887D]">Maths (Pro Model) Range</label>
                    <input 
                      type="text"
                      value={mathRange}
                      onChange={(e) => setMathRange(e.target.value)}
                      placeholder="e.g. 101-225"
                      disabled={isGenerating}
                      className={cn(
                        "w-full border p-3 text-sm font-bold focus:outline-none transition-colors disabled:opacity-50",
                        theme === 'dark' 
                          ? "bg-white/5 text-[#F9F7F2] border-white/10 focus:border-[#F9F7F2]/50 placeholder:text-[#F9F7F2]/30" 
                          : "bg-white text-[#1A1A1A] border-[#D1CEC5] focus:border-[#1A1A1A] placeholder:text-[#8C887D]/50"
                      )}
                    />
                  </div>
                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-[#8C887D]">Questions Per Batch</label>
                    <input 
                      type="number"
                      value={batchSize}
                      onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
                      min="1"
                      max="50"
                      disabled={isGenerating}
                      className={cn(
                        "w-full border p-3 text-sm font-bold focus:outline-none transition-colors disabled:opacity-50",
                        theme === 'dark' 
                          ? "bg-white/5 text-[#F9F7F2] border-white/10 focus:border-[#F9F7F2]/50" 
                          : "bg-white text-[#1A1A1A] border-[#D1CEC5] focus:border-[#1A1A1A]"
                      )}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }} className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-[#8C887D]">Question Range</label>
                    <input 
                      type="text"
                      value={questionRange}
                      onChange={(e) => setQuestionRange(e.target.value)}
                      placeholder="e.g. 1-225"
                      disabled={isGenerating}
                      className={cn(
                        "w-full border p-3 text-sm font-bold focus:outline-none transition-colors disabled:opacity-50",
                        theme === 'dark' 
                          ? "bg-white/5 text-[#F9F7F2] border-white/10 focus:border-[#F9F7F2]/50 placeholder:text-[#F9F7F2]/30" 
                          : "bg-white text-[#1A1A1A] border-[#D1CEC5] focus:border-[#1A1A1A] placeholder:text-[#8C887D]/50"
                      )}
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-[#8C887D]">Questions Per Batch</label>
                    <input 
                      type="number"
                      value={batchSize}
                      onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
                      min="1"
                      max="50"
                      disabled={isGenerating}
                      className={cn(
                        "w-full border p-3 text-sm font-bold focus:outline-none transition-colors disabled:opacity-50",
                        theme === 'dark' 
                          ? "bg-white/5 text-[#F9F7F2] border-white/10 focus:border-[#F9F7F2]/50" 
                          : "bg-white text-[#1A1A1A] border-[#D1CEC5] focus:border-[#1A1A1A]"
                      )}
                    />
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </aside>
      )}

      {/* Right Panel: Output Canvas */}
      <main className={cn(
        "flex-1 flex flex-col overflow-hidden relative transition-colors duration-500 pt-16 lg:pt-20",
        theme === 'dark' ? "bg-[#18181B]" : "bg-[#FFFDF9]"
      )}>
        {/* Navigation / Toolbar */}
        <nav 
          className={cn(
            "h-16 lg:h-20 border-b flex items-center justify-between px-6 lg:px-12 fixed top-0 left-0 right-0 z-50 transition-colors shadow-sm",
            theme === 'dark' ? "bg-[#18181B] border-white/10" : "bg-[#FFFDF9] border-[#D1CEC5]"
          )}
        >
          <div className="flex-1" />
          
          <div className="flex-1 flex justify-center">
            <div className={cn("flex rounded-full p-1 transition-colors", theme === 'dark' ? "bg-white/10" : "bg-[#EBE8DF]")}>
              <button
                onClick={() => setViewMode('workspace')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-tighter transition-all",
                  viewMode === 'workspace' 
                    ? (theme === 'dark' ? "bg-[#F9F7F2] text-[#1A1A1A]" : "bg-white text-[#1A1A1A] shadow-sm")
                    : (theme === 'dark' ? "text-[#F9F7F2] hover:text-[#F9F7F2]/80" : "text-[#8C887D] hover:text-[#1A1A1A]")
                )}
              >
                Workspace
              </button>
              <button
                onClick={() => setViewMode('memory')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-tighter transition-all",
                  viewMode === 'memory'
                    ? (theme === 'dark' ? "bg-[#F9F7F2] text-[#1A1A1A]" : "bg-white text-[#1A1A1A] shadow-sm")
                    : (theme === 'dark' ? "text-[#F9F7F2] hover:text-[#F9F7F2]/80" : "text-[#8C887D] hover:text-[#1A1A1A]")
                )}
              >
                Memory
              </button>
            </div>
          </div>
          
          <div className="flex-1 flex justify-end">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={cn(
                "px-4 py-2 border rounded-full transition-colors flex items-center gap-2 text-[10px] uppercase font-bold tracking-tight shadow-sm",
                theme === 'dark' ? "border-white/20 bg-white/5 text-[#F9F7F2] hover:bg-white/10" : "border-[#D1CEC5] bg-white text-[#1A1A1A] hover:bg-[#F9F7F2]"
              )}
              title="Toggle Theme"
            >
              {theme === 'light' ? <Moon className="w-3.5 h-3.5 text-[#1A1A1A]" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
              <span className="hidden sm:inline-block">{theme === 'light' ? 'Dark Theme' : 'Light Theme'}</span>
            </button>
          </div>
        </nav>

        {/* The "Paper" Container */}
        <div 
          className="flex-1 overflow-y-auto p-6 lg:p-14 flex justify-center shadow-inner scrollbar-thin scrollbar-thumb-[#D1CEC5]"
        >
          <AnimatePresence mode="wait">
            {viewMode === 'memory' ? (
              <motion.div 
                key="memory"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                className="w-full max-w-[850px] flex flex-col items-center"
              >
                <div className={cn("w-full flex justify-between items-end mb-8 border-b pb-4", theme === 'dark' ? "border-white/10" : "border-[#D1CEC5]")}>
                  <div>
                    <h2 className={cn("text-2xl font-serif italic", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}>Application Memory</h2>
                    <p className={cn("text-[10px] uppercase tracking-widest mt-1", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Files saved to your local storage for 48 hours</p>
                  </div>
                  <div className={cn("text-[10px] uppercase font-bold", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>{memory.length} ENTRIES</div>
                </div>

                {memory.length === 0 ? (
                  <div className={cn("w-full h-64 flex flex-col items-center justify-center border border-dashed text-[#8C887D] transition-colors", theme === 'dark' ? "border-white/10 bg-white/5" : "border-[#D1CEC5] bg-white/50")}>
                    <FileText className="w-8 h-8 mb-4 opacity-20" />
                    <p className="text-[10px] uppercase tracking-widest font-bold">No saved files found</p>
                  </div>
                ) : (
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                    {sortedMemory.map((item) => (
                      <motion.div 
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ y: -4, borderColor: theme === 'dark' ? 'rgba(255,255,255,0.3)' : '#1A1A1A' }}
                        className={cn(
                          "border p-6 shadow-sm hover:shadow-xl transition-all group flex flex-col relative",
                          theme === 'dark' ? "bg-white/5 border-white/10" : "bg-white border-[#D1CEC5]"
                        )}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className={cn("p-2 transition-colors", theme === 'dark' ? "bg-white/10 group-hover:bg-white/20" : "bg-[#F9F7F2] group-hover:bg-[#EBE8DF]")}>
                             <FileText className={cn("w-5 h-5", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")} />
                          </div>
                          <button 
                            onClick={(e) => deleteMemoryItem(item.id, e)}
                            className="p-1 text-[#D1CEC5] hover:text-red-500 transition-colors"
                          >
                             <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h4 className={cn("text-sm font-bold truncate mb-1", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}>{item.name}</h4>
                        <p className={cn("text-[8px] uppercase tracking-widest mb-4", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")}>
                          {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} @ {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        
                        <div className={cn("mt-auto pt-4 border-t flex gap-2", theme === 'dark' ? "border-white/10" : "border-[#F0EFE9]")}>
                          <motion.button 
                            whileTap={{ scale: 0.98 }}
                            onClick={() => { setResults(item.results); setViewMode('workspace'); }}
                            className={cn("flex-1 py-2.5 text-[9px] uppercase font-bold tracking-widest transition-all", theme === 'dark' ? "bg-white text-black hover:bg-gray-200" : "bg-[#1A1A1A] text-white hover:bg-[#333]")}
                          >
                            Restore to Workspace
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : !results && !isGenerating ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="w-full max-w-[850px] flex flex-col items-center"
              >
                <div className={cn("w-full flex justify-between items-end mb-8 border-b pb-4", theme === 'dark' ? "border-white/10" : "border-[#D1CEC5]")}>
                  <div>
                    <h2 className={cn("text-2xl font-serif italic", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}>New Conversion</h2>
                    <p className={cn("text-[10px] uppercase tracking-widest mt-1", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Upload a PDF to start processing</p>
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-[600px] mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/20 text-[#B91C1C] dark:text-red-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-3 shadow-sm"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    {error}
                  </motion.div>
                )}

                <div className="w-full max-w-[600px] mt-10">
                  {!file ? (
                    <div 
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "w-full h-80 border-2 border-dashed flex flex-col items-center justify-center p-12 text-center cursor-pointer transition-all group shadow-sm",
                        theme === 'dark' ? "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30" : "border-[#D1CEC5] bg-white hover:border-[#1A1A1A] hover:bg-[#FFFDF9]"
                      )}
                    >
                      <div className={cn("p-6 rounded-full mb-6 transition-colors", theme === 'dark' ? "bg-white/10 group-hover:bg-white/20" : "bg-[#F9F7F2] group-hover:bg-[#EBE8DF]")}>
                        <FileUp className={cn("w-12 h-12", theme === 'dark' ? "text-white opacity-60" : "text-[#1A1A1A] opacity-60")} />
                      </div>
                      <h3 className={cn("text-xl font-serif italic mb-2", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}>Stage Document</h3>
                      <p className={cn("text-[10px] uppercase tracking-widest mb-8", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Drag & Drop or Click to browse your PDF</p>
                      <button className={cn("px-8 py-3 text-[10px] uppercase font-bold tracking-widest transition-colors", theme === 'dark' ? "bg-white text-black hover:bg-gray-200" : "bg-[#1A1A1A] text-white hover:bg-[#333]")}>
                        Choose File
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".pdf" 
                        className="hidden" 
                      />
                    </div>
                  ) : (
                    <div className={cn(
                      "w-full border p-10 flex flex-col items-center justify-center relative shadow-md",
                      theme === 'dark' ? "bg-white/5 border-white/20" : "bg-white border-[#1A1A1A]"
                    )}>
                      <button 
                        onClick={clearWorkspace}
                        className="absolute top-4 right-4 text-[#D1CEC5] hover:text-red-500 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <div className={cn("p-6 rounded-full mb-6", theme === 'dark' ? "bg-white/10" : "bg-[#F9F7F2]")}>
                        <FileText className={cn("w-12 h-12", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")} />
                      </div>
                      <h3 className={cn("text-lg font-bold mb-1 text-center max-w-sm truncate", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}>{file.name}</h3>
                      <p className={cn("text-[10px] uppercase tracking-widest mb-10", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>{(file.size / (1024 * 1024)).toFixed(2)} MB • READY FOR CONVERSION</p>
                      
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleGenerate}
                        className={cn(
                          "w-full py-4 text-[11px] uppercase font-bold tracking-[0.2em] transition-all flex items-center justify-center gap-3",
                          theme === 'dark' ? "bg-white text-black hover:bg-gray-200" : "bg-[#1A1A1A] text-white hover:bg-[#333]"
                        )}
                      >
                        Start Conversion Engine
                        <ArrowRight className="w-4 h-4" />
                      </motion.button>
                    </div>
                  )}

                  <motion.div 
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
                    }}
                    className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6"
                  >
                    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col items-center text-center p-4">
                       <Sparkles className={cn("w-5 h-5 mb-3", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                       <h4 className={cn("text-[10px] uppercase font-bold tracking-widest mb-2", theme === 'dark' ? "text-white/80" : "text-[#1A1A1A]")}>AI Extraction</h4>
                       <p className={cn("text-[9px] leading-relaxed", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>High-fidelity reconstruction using Gemini neural models.</p>
                    </motion.div>
                    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className={cn("flex flex-col items-center text-center p-4 border-l border-r", theme === 'dark' ? "border-white/10" : "border-[#D1CEC5]")}>
                       <FileCode2 className={cn("w-5 h-5 mb-3", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                       <h4 className={cn("text-[10px] uppercase font-bold tracking-widest mb-2", theme === 'dark' ? "text-white/80" : "text-[#1A1A1A]")}>LaTeX Math</h4>
                       <p className={cn("text-[9px] leading-relaxed", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Perfect mathematical formula rendering with KaTeX.</p>
                    </motion.div>
                    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="flex flex-col items-center text-center p-4">
                       <CheckCircle2 className={cn("w-5 h-5 mb-3", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                       <h4 className={cn("text-[10px] uppercase font-bold tracking-widest mb-2", theme === 'dark' ? "text-white/80" : "text-[#1A1A1A]")}>Dual Export</h4>
                       <p className={cn("text-[9px] leading-relaxed", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Download as polished PDF or structured Markdown.</p>
                    </motion.div>
                  </motion.div>
                  
                  <div className="mt-12 flex justify-center">
                    <button 
                      onClick={loadSampleCase}
                      className={cn("text-[8px] uppercase tracking-widest font-bold border-b border-transparent hover:border-current transition-all py-1 opacity-40 hover:opacity-100", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}
                    >
                      Test LaTeX & Mermaid Rendering
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : isGenerating ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-[700px] h-full flex flex-col items-center justify-center p-12"
              >
                <div className="w-full max-w-[420px] space-y-12">
                  <div className="text-center">
                    <h3 className={cn("text-2xl font-serif italic mb-2", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}>Analyzing Document</h3>
                    <p className={cn("text-[10px] uppercase tracking-widest", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Generating content, please wait...</p>
                  </div>
                  
                  <div className="space-y-4">
                    {!showLogs ? (
                      (() => {
                        const stages = [
                          { key: "Upload", label: "Uploading Document", isPast: progress > 0, isCurrent: progress === 0 },
                          { key: "Extracting Content (MD)", label: progress > 5 && progress <= 45 ? statusMessage : "Extracting Content (MD)", isPast: progress >= 50, isCurrent: progress > 0 && progress < 50 },
                          { key: "Generating Solutions", label: progress >= 50 && progress < 100 ? statusMessage : "Generating Solutions", isPast: progress >= 100, isCurrent: progress >= 50 && progress < 100 },
                          { key: "Finalize", label: "Finalizing", isPast: progress >= 100, isCurrent: progress === 100 && isGenerating }
                        ];
                        
                        return stages.map((stage, index) => {
                          const isDark = theme === 'dark';
                          return (
                            <motion.div 
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.1 }}
                              key={stage.key} 
                              className={cn(
                                "flex items-center gap-4 text-sm transition-all duration-500",
                                stage.isPast ? (isDark ? "text-white/30" : "text-[#1A1A1A] opacity-50") : 
                                stage.isCurrent ? (isDark ? "text-white font-bold scale-105" : "text-[#1A1A1A] font-bold scale-105") : 
                                (isDark ? "text-white/10" : "text-[#D1CEC5]")
                              )}
                            >
                              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                {stage.isPast ? (
                                  <Check className="w-4 h-4" />
                                ) : stage.isCurrent ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <div className="w-2 h-2 rounded-full bg-current opacity-30" />
                                )}
                              </div>
                              <span className={cn(
                                "transition-all duration-300",
                                stage.isCurrent && (isDark ? "text-white" : "bg-gradient-to-r from-[#1A1A1A] to-[#666] bg-clip-text text-transparent")
                              )}>{stage.label}</span>
                            </motion.div>
                          )
                        });
                      })()
                    ) : (
                      <div className="bg-[#1A1A1A] dark:bg-[#000] text-[#F9F7F2] font-mono text-[10px] p-4 border border-white/5 rounded shadow-inner h-48 overflow-y-auto space-y-1 text-left relative flex flex-col scrollbar-thin scrollbar-thumb-white/10">
                         {logs.map((log, i) => (
                           <motion.div 
                             initial={{ opacity: 0, x: -5 }}
                             animate={{ opacity: 1, x: 0 }}
                             key={i} 
                             className="opacity-90 flex gap-2"
                           >
                             <span className="text-[#F9F7F2]/30 shrink-0">[{log.time.toLocaleTimeString()}]</span>
                             <span className="text-[#F9F7F2]/80">{log.stage}</span>
                             <span className="text-[#F9F7F2]/40 ml-auto">{log.percent}%</span>
                           </motion.div>
                         ))}
                         {logs.length === 0 && <div className="text-[#F9F7F2]/30 italic">Initializing systems...</div>}
                         <motion.div 
                           animate={{ opacity: [1, 0] }}
                           transition={{ repeat: Infinity, duration: 0.8 }}
                           className="mt-2 text-[#F9F7F2] w-1.5 h-3 bg-current"
                         />
                         <div ref={logsEndRef} />
                      </div>
                    )}
                  </div>

                  <div className={cn("space-y-3 pt-4 border-t", theme === 'dark' ? "border-white/10" : "border-[#EBE8DF]")}>
                    <div className={cn("relative h-1 w-full overflow-hidden rounded-full", theme === 'dark' ? "bg-white/10" : "bg-[#EBE8DF]")}>
                      <motion.div 
                        className={cn("absolute h-full transition-colors", theme === 'dark' ? "bg-[#F9F7F2]" : "bg-[#1A1A1A]")}
                        initial={{ width: "0%" }}
                        animate={{ width: `${progress}%` }}
                        transition={{ ease: "linear", duration: 0.5 }}
                      />
                    </div>
                    
                    <div className={cn("flex justify-between items-center text-[9px] uppercase tracking-widest", theme === 'dark' ? "text-[#F9F7F2]" : "text-[#8C887D]")}>
                      <span className="font-bold">{progress}% Generated</span>
                      <span className={theme === 'dark' ? "opacity-60" : ""}>Est. ~{formatTime(Math.max(0, estimatedTime))} remaining</span>
                    </div>
                    
                    <div className="flex justify-center pt-2">
                       <button 
                         onClick={() => setShowLogs(!showLogs)}
                         className={cn("text-[10px] uppercase tracking-widest font-bold transition-colors", theme === 'dark' ? "text-white/50 hover:text-white" : "text-[#8C887D] hover:text-[#1A1A1A]")}
                       >
                         {showLogs ? "Hide Logs" : "View Logs"}
                       </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="result"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-[850px] h-full flex flex-col items-center"
              >
                <div className="w-full max-w-[420px] text-center space-y-8 mt-20">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 12 }}
                    className="mx-auto w-16 h-16 bg-[#1A1A1A] dark:bg-white rounded-full flex items-center justify-center text-white dark:text-[#1A1A1A] mb-6"
                  >
                    <Check className="w-8 h-8" />
                  </motion.div>
                  
                  <div className="bg-[#F9F7F2] dark:bg-[#1A1A1A] p-3 border border-[#D1CEC5] dark:border-[#333] text-[9px] uppercase tracking-[0.15em] font-bold text-[#8C887D] mb-2">
                    <span className="flex items-center justify-center gap-2">
                      <Sparkles className="w-3 h-3" />
                      PDF/MD Export theme: {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
                    </span>
                  </div>
                  
                  <div>
                    <h3 className={cn("text-2xl font-serif italic mb-2", theme === 'dark' ? "text-white" : "text-[#1A1A1A]")}>Generation Complete</h3>
                    <p className={cn("text-[10px] uppercase tracking-widest", theme === 'dark' ? "text-white/50" : "text-[#8C887D]")}>Your document is ready for export.</p>
                  </div>

                  <div className="flex flex-col gap-5 pt-6 w-full text-left">
                    <div className="flex flex-col gap-2 w-full mt-2">
                      <div className="flex justify-between items-center px-1">
                        <p className={cn("text-[10px] font-bold uppercase tracking-widest mb-1", theme === 'dark' ? "text-[#F9F7F2]/60" : "text-[#8C887D]")}>Export to High-Fidelity PDF</p>
                        <button 
                          onClick={() => setShowPreview(!showPreview)}
                          className={cn("text-[9px] uppercase tracking-tighter font-bold flex items-center gap-1.5 transition-colors", theme === 'dark' ? "text-white/40 hover:text-white" : "text-[#8C887D] hover:text-[#1A1A1A]")}
                        >
                          {showPreview ? <X className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
                          {showPreview ? "Close Preview" : "Quick Look (UI)"}
                        </button>
                      </div>
                      <motion.button 
                        whileHover={{ x: 5, backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#F9F7F2' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDownloadPdf(theme, 'exam')}
                        className={cn("py-3 px-4 border font-bold uppercase tracking-widest text-[10px] flex items-center justify-between transition-colors shadow-sm text-left", theme === 'dark' ? "border-white/20 text-white bg-white/5" : "border-[#D1CEC5] text-[#1A1A1A] bg-white")}
                      >
                        <span className="flex items-center gap-3">
                          <FileText className={cn("w-3.5 h-3.5", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                          Questions Only
                        </span>
                        <Download className={cn("w-3.5 h-3.5", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                      </motion.button>
                      <motion.button 
                        whileHover={{ x: 5, backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#F9F7F2' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDownloadPdf(theme, 'solutions')}
                        className={cn("py-3 px-4 border font-bold uppercase tracking-widest text-[10px] flex items-center justify-between transition-colors shadow-sm text-left", theme === 'dark' ? "border-white/20 text-white bg-white/5" : "border-[#D1CEC5] text-[#1A1A1A] bg-white")}
                      >
                        <span className="flex items-center gap-3">
                          <Check className={cn("w-3.5 h-3.5", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                          Solutions Only
                        </span>
                        <Download className={cn("w-3.5 h-3.5", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDownloadPdf(theme, 'both')}
                        className={cn("py-3 px-4 border font-bold uppercase tracking-widest text-[10px] flex items-center justify-between transition-colors shadow-sm text-left", theme === 'dark' ? "border-white/20 text-white bg-white/20 hover:bg-white/30" : "border-[#1A1A1A] text-white bg-[#1A1A1A] hover:bg-[#333]")}
                      >
                        <span className="flex items-center gap-3">
                          <FileCode2 className="w-3.5 h-3.5 text-white/70" />
                          Both (Combined)
                        </span>
                        <Download className="w-3.5 h-3.5 text-white/70" />
                      </motion.button>
                    </div>

                    <div className="flex flex-col gap-2 w-full mt-2">
                      <p className={cn("text-[10px] font-bold uppercase tracking-widest mb-1 px-1", theme === 'dark' ? "text-[#F9F7F2]/60" : "text-[#8C887D]")}>Export as Markdown (.MD)</p>
                      <motion.button 
                        whileHover={{ x: 5, backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#F9F7F2' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDownloadMd('exam')}
                        className={cn("py-3 px-4 border font-bold uppercase tracking-widest text-[10px] flex items-center justify-between transition-colors shadow-sm text-left", theme === 'dark' ? "border-white/20 text-white bg-white/5" : "border-[#D1CEC5] text-[#1A1A1A] bg-white")}
                      >
                        <span className="flex items-center gap-3">
                          <FileText className={cn("w-3.5 h-3.5", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                          Questions Only
                        </span>
                        <Download className={cn("w-3.5 h-3.5", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                      </motion.button>
                      <motion.button 
                        whileHover={{ x: 5, backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#F9F7F2' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDownloadMd('solutions')}
                        className={cn("py-3 px-4 border font-bold uppercase tracking-widest text-[10px] flex items-center justify-between transition-colors shadow-sm text-left", theme === 'dark' ? "border-white/20 text-white bg-white/5" : "border-[#D1CEC5] text-[#1A1A1A] bg-white")}
                      >
                        <span className="flex items-center gap-3">
                          <Check className={cn("w-3.5 h-3.5", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                          Solutions Only
                        </span>
                        <Download className={cn("w-3.5 h-3.5", theme === 'dark' ? "text-white/40" : "text-[#8C887D]")} />
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDownloadMd('both')}
                        className={cn("py-3 px-4 border font-bold uppercase tracking-widest text-[10px] flex items-center justify-between transition-colors shadow-sm text-left", theme === 'dark' ? "border-white/20 text-white bg-white/20 hover:bg-white/30" : "border-[#1A1A1A] text-white bg-[#1A1A1A] hover:bg-[#333]")}
                      >
                        <span className="flex items-center gap-3">
                          <FileCode2 className="w-3.5 h-3.5 text-white/70" />
                          Both (Combined)
                        </span>
                        <Download className="w-3.5 h-3.5 text-white/70" />
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showPreview && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="w-full mt-8 border-t border-dashed pt-8 overflow-hidden"
                      >
                        <div className={cn("w-full p-8 text-left rounded-lg shadow-inner max-h-[60vh] overflow-y-auto scrollbar-thin", theme === 'dark' ? "bg-white/5" : "bg-[#F3F2EE]")}>
                          <MarkdownContent 
                            theme={theme}
                            content={`# Questions Preview\n\n${results?.formattedExam}\n\n---\n\n# Solutions Preview\n\n${results?.solutionManual}`} 
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className={cn("mt-10 pt-8 border-t w-full flex justify-center", theme === 'dark' ? "border-white/10" : "border-[#D1CEC5]")}>
                    <motion.button 
                      whileHover={{ scale: 1.05, x: 2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={clearWorkspace}
                      className={cn("text-[10px] uppercase font-bold tracking-widest transition-colors flex items-center gap-2", theme === 'dark' ? "text-white/50 hover:text-white" : "text-[#8C887D] hover:text-[#1A1A1A]")}
                    >
                      <X className="w-3 h-3" />
                      Start New Conversion
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stats Footer */}
        <footer className={cn(
          "h-12 border-t flex items-center px-6 lg:px-12 justify-between text-[10px] uppercase tracking-widest font-bold transition-colors",
          theme === 'dark' ? "bg-[#121212] border-white/10 text-[#F9F7F2]/60" : "bg-[#F9F7F2] border-[#D1CEC5] text-[#8C887D]"
        )}>
          <div className="flex items-center gap-2">
            <span className={cn("w-1.5 h-1.5 rounded-full", isGenerating ? "bg-amber-400 animate-pulse" : "bg-emerald-500")} />
            System: {isGenerating ? "Synthesizing" : "Standby"}
          </div>
          <div className="hidden md:block flex-1 mx-12 overflow-hidden whitespace-nowrap italic opacity-40 relative h-full">
            <div className={cn("absolute inset-y-0 left-0 w-24 bg-gradient-to-r z-10", theme === 'dark' ? "from-[#121212] to-transparent" : "from-[#F9F7F2] to-transparent")} />
            <div className={cn("absolute inset-y-0 right-0 w-24 bg-gradient-to-l z-10", theme === 'dark' ? "from-[#121212] to-transparent" : "from-[#F9F7F2] to-transparent")} />
            <AnimatePresence mode="wait">
              <motion.div
                key={dynamicThought}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 1.2, ease: "easeInOut" }}
                className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap left-0 right-0 text-center"
              >
                "{dynamicThought}"
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-4">
            {isGenerating && (
              <span className={cn("hidden lg:inline text-[9px] font-bold animate-pulse tracking-widest uppercase", theme === 'dark' ? "text-green-400" : "text-green-600")}>
                Caching Progress...
              </span>
            )}
            {lastSaved && !isGenerating && (
              <span className="hidden lg:inline text-[9px] opacity-40">
                Memory: {new Date(lastSaved).toLocaleTimeString()}
              </span>
            )}
            <div>{selectedModel.includes('pro') ? 'Gemini Pro' : 'Gemini Flash'} Engine</div>
          </div>
        </footer>
      </main>
      </motion.div>
    </div>
  );
}


