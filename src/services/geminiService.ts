import { GoogleGenAI } from "@google/genai";

const aiPrimary = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const aiFallback = process.env.GEMINI_API_KEY_FALLBACK ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_FALLBACK }) : null;

export interface GenerationResult {
  formattedExam: string;
  solutionManual: string;
}

export type ProgressCallback = (stage: string, percent: number) => void;
export type PartialResultCallback = (results: { examChunks?: string[], solutionChunks?: string[] }) => void;

// Delay function
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Retry wrapper
async function withRetry<T>(operation: (aiClient: GoogleGenAI) => Promise<T>, maxRetries = 5): Promise<T> {
  let attempt = 0;
  let lastError: any;
  let useFallback = false;

  while (attempt < maxRetries) {
    try {
      const currentAi = (useFallback && aiFallback) ? aiFallback : aiPrimary;
      return await operation(currentAi);
    } catch (err: any) {
      lastError = err;
      attempt++;
      
      const errorMessage = err?.message?.toLowerCase() || '';
      const isRateLimit = err?.status === 429 || errorMessage.includes('429') || errorMessage.includes('too many requests') || errorMessage.includes('quota') || errorMessage.includes('resource exhausted');
      const isAuthError = err?.status === 403 || errorMessage.includes('403') || errorMessage.includes('permission_denied') || errorMessage.includes('api key');

      if (aiFallback && !useFallback && isRateLimit) {
        console.warn(`Primary key hit Rate Limit/Quota. Switching to fallback key...`);
        useFallback = true;
        attempt = 0; // Reset attempts to give fallback a full chance
        continue;
      }
      
      if (isRateLimit) {
        // Aggressive backoff for rate limits: 20s, 40s, 80s...
        const waitTime = Math.min(20000 * Math.pow(2, attempt - 1), 120000); 
        console.warn(`Rate limit hit on ${useFallback ? 'fallback' : 'primary'} key (Attempt ${attempt}/${maxRetries}). Cooling down for ${waitTime/1000}s...`);
        await delay(waitTime);
        continue;
      }

      if (err?.status === 403 || err?.status === 404 || errorMessage.includes('403') || errorMessage.includes('404')) {
        throw err; // don't retry hard errors if we've exhausted fallback options
      }

      if (attempt >= maxRetries) break;
      await delay(3000 * attempt);
    }
  }
  throw lastError;
}

const EXAM_DEVELOPER_PROMPT = `Act as an expert Educational Content Developer and STEM formatting specialist. 

Your task is to reconstruct this PDF exam into a beautifully formatted, mathematically accurate Markdown (.md) file.
IMPORTANT: The answer key is likely on the LAST PAGE of this document. Use it to verify the correct answers for each question.

STRICT formatting rules:
1. FIX OCR ERRORS & THEORETICAL ACCURACY: Reconstruct all math, physics, and chemical formulas using standardized LaTeX. 
   - USE $ for inline math: $E = mc^2$.
   - USE $$ for block math: $$\\psi(x,t) = A e^{i(kx-\\omega t)}$$.
   - DELIMITERS: Always use $ for inline and $$ for blocks. Do NOT use \\( \\) or \\[ \\]. 
   - SYMBOLS: Do NOT escape the dollar signs or brackets (e.g., use $x$ NOT \\$x\\$). 
   - BLOCK MATH SPACING: Always place $$ on their own lines. Do NOT indent math blocks; they must be at the start of the line (zero indentation) to avoid being parsed as code blocks.
   - CHEMISTRY: Use proper subscripts/superscripts. Use standard LaTeX like \\text{H}_2\\text{O}. DO NOT USE \\ce{} notation format since the mhchem package is not supported by the renderer.
   - COMPLEX MATH: Use block LaTeX ($$) for matrices, integrals, and multi-line derivations to avoid line-breaking issues.
   - SPACING: Always ensure a space exists between text and inline math (e.g., "the value of $x$ is" instead of "the value of$x$is").
2. LATEX INTEGRITY: Double-check all braces {} and symbols. Do NOT let OCR artifacts (like | or /) replace proper LaTeX symbols (like \\mid or \\frac). Use \\vec{} for vectors and \\dot{} for derivatives.
3. NO EXPLANATIONS: Do NOT provide any solutions, hints, or explanations in this file.
4. QUESTION FORMAT: Bold the entire question text. Do not bold the options. MUST LEAVE ONE COMPLETELY BLANK LINE BEFORE LISTING OPTIONS. Start each question with "**Q[#].** " (e.g., **Q1.**).
5. OPTION FORMAT: Options must be listed neatly on separate lines starting with (A), (B), (C), and (D).
6. DIAGRAMS & IMAGES: If a question contains a visual, diagram, plot, or circuit, recreate it using a Mermaid.js code block (\`\`\`mermaid) ONLY IF it can be represented by standard Mermaid types like 'flowchart TD', 'flowchart LR', 'pie', 'erDiagram', or 'mindmap'. 
   - STYLE ENHANCEMENT: Use 'flowchart TD' or 'flowchart LR' for modern styling. 
   - Use 'subgraph' for logical grouping (e.g., 'subgraph System', 'subgraph Surroundings'). 
   - Use 'classDef' for color coding (e.g., green for positive results, red for negative, blue for inputs). 
   - TECHNICAL LABELS: Use precise STEM terminology in labels. Avoid generic 'A', 'B'. Use 'Mass $m_1$', 'Force $\\vec{F}$', 'Anode', 'Cathode'.
   - DO NOT use xychart-beta or experimental charts. 
   - If a diagram is too complex for Mermaid, provide a detailed technical description in markdown. DO NOT omit visual information.
7. ANSWER & DIFFICULTY FORMAT: Leave ONE completely BLANK LINE after option (D). Then provide the answer and difficulty separator exactly like: **Answer: (X)** | **Difficulty:** [Simple/Moderate/Difficult]
8. SEPARATORS: After the answer/difficulty line, you MUST add a markdown horizontal rule (---) surrounded by blank lines to draw a line between each question.
9. DIFFICULTY CRITERIA:
   - Simple: Direct application of a single formula, basic factual recall, single-step mathematical operations, or rudimentary arithmetic/algebra. No abstract reasoning required.
   - Moderate: Requires 2-3 distinct steps, intermediate algebraic manipulation (e.g., quadratic equations, basic calculus), combining two straightforward concepts, or interpreting standard graphs/diagrams.
   - Difficult: Highly abstract reasoning, multi-stage problem solving (>3 steps), complex calculations (e.g., advanced calculus, linear algebra, multivariable optimization), recognizing non-obvious patterns, or heavy conceptual and theoretical analysis.`;

const TUTOR_PROMPT = `Act as an expert Master STEM Tutor and Subject Matter Expert. 

Your task is to generate a beautifully formatted Markdown (.md) Solution Manual containing highly detailed, pedagogical, step-by-step explanations for the batch of questions provided below.
IMPORTANT: You MUST answer the questions IN ORDER as they appear in the batch.
IMPORTANT: An answer key may be provided below in the prompt (or you can check the last pages of the PDF). You MUST use the answer key to verify your answers and ensure your generated explanations arrive at the exact correct final answer.

STRICT formatting rules:
1. NO QUESTION TEXT OR OPTIONS: Do NOT rewrite original question text or list options.
2. FIX OCR ERRORS & THEORETICAL ACCURACY: Reconstruct all math, physics, and chemical formulas in explanations using LaTeX. 
   - USE $ for inline math: $E = mc^2$.
   - USE $$ for block math: $$\\psi(x,t) = A e^{i(kx-\\omega t)}$$.
   - DELIMITERS: Always use $ for inline and $$ for blocks. Do NOT use \\( \\) or \\[ \\]. 
   - SYMBOLS: Do NOT escape the dollar signs or brackets (e.g., use $x$ NOT \\$x\\$). 
   - PEDAGOGY: Break down complex math step-by-step. Use block math ($$) for each significant calculation step to ensure clarity and vertical separation.
   - BLOCK MATH SPACING: Always place $$ on their own lines. Do NOT indent math blocks; they must be at the start of the line (zero indentation) to avoid being parsed as code blocks.
   - INTEGRITY: Ensure all LaTeX is correctly formatted. Fix missing closing braces and mismatched $ signs.
   - CHEMISTRY: Use proper chemical notation. Use standard LaTeX like \\text{H}_2\\text{O}. DO NOT USE \\ce{} notation format since the mhchem package is not supported by the renderer.
3. LATEX STRUCTURAL INTEGRITY: (Redundant if merged above, but kept for alignment) Fix missing closing braces, unclosed environments, and mismatched $ signs. Ensure clear separation between text and math blocks. 
4. HEADER FORMAT: Start each solution with: **Q[#]. Answer: (X)** | **Difficulty:** [Simple/Moderate/Difficult]
5. EXPLANATION STRUCTURE: Use bullet points with BOLD lead-ins like "**Concept:**", "**Formula:**", "**Calculation:**", "**Deep Dive:**".
6. EXPLANATION QUALITY: For mathematical problems, you MUST provide deep conceptual explanations, focusing heavily on the 'Why' behind formulas and intermediate steps, not just the 'How'. This is especially critical for 'Difficult' category questions, where you must unpack the theoretical underpinnings and abstract logic before proceeding to step-by-step calculations.
7. SPACING & SEPARATOR: Always leave a blank line, followed by a markdown horizontal rule (---), followed by another blank line between the end of one solution and the start of the next question.
8. DIAGRAMS & GRAPHS: If a question references a diagram, flow chart, graph, or circuit, you MUST recreate it using Mermaid.js code blocks (\`\`\`mermaid) using valid syntax like 'flowchart TD' or 'flowchart LR'. 
   - PEDAGOGICAL ENHANCEMENT: Use diagrams to clarify conceptual paths. For physics, use subgraphs to separate vectors; for chemistry, use flowcharts for mechanism steps. 
   - Use 'classDef' to highlight critical nodes (e.g., 'Transition State', 'Equilibrium'). 
   - TECHNICAL LABELS: Ensure labels use proper terminology and LaTeX notation where helpful (e.g. 'Concentration $[H^+]$').
   - DO NOT invent invalid chart types.
9. IMAGES: If there are actual images that cannot be recreated accurately with Mermaid, use Markdown image syntax if you have a URL or reference. For complex math plots, you can also output a Mermaid graph that approximates it.`;

export async function generateScholarThoughts(excludedThoughts: string[] = []): Promise<string[]> {
  try {
    const prompt = `Act as an inspirational educational AI. Generate 5 unique, short, and profound thoughts or quotes about STEM, mathematics, physics, deep learning, or the beauty of scientific discovery.
    
    EXCLUDE these thoughts if any: ${excludedThoughts.slice(-20).join('; ')}
    
    Format: Return ONLY a JSON array of strings. No extra text.
    Example: ["Mathematics is the language in which God has written the universe.", "Every science begins as philosophy and ends as art."]`;

    const response = await withRetry((client) => client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: prompt }] }],
    }), 2);
    
    const text = response.text || "[]";
    const thoughts = JSON.parse(text);
    return Array.isArray(thoughts) ? thoughts : [];
  } catch (error) {
    console.error("Failed to generate scholar thoughts:", error);
    return [
      "The laws of nature are but the mathematical thoughts of God.",
      "In the middle of difficulty lies opportunity.",
      "Science is a way of thinking much more than it is a body of knowledge.",
      "Mathematics is the most beautiful and most powerful creation of the human spirit."
    ];
  }
}

export async function checkAiStatus(modelName: string): Promise<boolean> {
  const currentAi = aiPrimary;
  try {
    const response = await currentAi.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: "Respond with 'ok'" }] }],
    });
    const text = response.text || "";
    return text.toLowerCase().includes("ok");
  } catch (error: any) {
    if (error?.status === 403 || error?.message?.includes('403') || error?.message?.includes('PERMISSION_DENIED')) {
      throw new Error(`Access Denied (403): You don't have permission for ${modelName}. Try selecting Gemini 2.0 Flash or 2.5 Flash from the dropdown.`);
    }
    if (error?.status === 404 || error?.message?.includes('404') || error?.message?.includes('NOT_FOUND')) {
      throw new Error(`Not Found (404): ${modelName} is not available. Please pick a different model.`);
    }
    console.error("AI Status Check Failed:", error);
    // Try again with 'models/' prefix if it failed without it
    if (!modelName.startsWith('models/')) {
      try {
        const response = await currentAi.models.generateContent({
          model: `models/${modelName}`,
          contents: [{ parts: [{ text: "Respond with 'ok'" }] }],
        });
        const text = response.text || "";
        return text.toLowerCase().includes("ok");
      } catch (retryError) {
        console.error("AI Status Check (with prefix) Failed:", retryError);
      }
    }
    return false;
  }
}

export async function generateContent(
  pdfBase64: string, 
  modelName: string = "gemini-3.1-pro-preview",
  questionRange: string = '1-225',
  batchSize: number = 25,
  onProgress?: ProgressCallback,
  subject: 'physics' | 'chemistry' | 'maths' | 'other' = 'other',
  onPartialResult?: PartialResultCallback
): Promise<GenerationResult> {
  let activeModel = modelName;

  try {
    const pdfPart = {
      inlineData: {
        data: pdfBase64,
        mimeType: "application/pdf"
      }
    };

    let rangeStart = 1;
    let rangeEnd = 225;
    if (questionRange.includes('-')) {
      const parts = questionRange.split('-');
      rangeStart = parseInt(parts[0].trim(), 10) || 1;
      rangeEnd = parseInt(parts[1].trim(), 10) || rangeStart;
    } else {
      rangeEnd = parseInt(questionRange.trim(), 10) || 225;
      rangeStart = parseInt(questionRange.trim(), 10) || 1;
      if (rangeEnd > 0 && String(questionRange).trim() !== '') {
          rangeStart = 1;
      }
    }
    const totalQuestions = Math.max(1, rangeEnd - rangeStart + 1);
    const numBatches = Math.ceil(totalQuestions / batchSize);

    // Concurrency Limit logic
    // Flash models (1.5, 2.0, 3) handle parallel requests well
    const isFlash = activeModel.toLowerCase().includes('flash') || activeModel.includes('gemini-3-flash');
    // If it's a Pro model, strictly limit to 1 concurrent request to avoid 429 Rate Limits
    const maxConcurrency = isFlash ? 6 : 1; 
    
    const runInBatches = async <T, R>(
        items: T[], 
        concurrency: number, 
        task: (item: T, index: number, aiClient: GoogleGenAI) => Promise<R>,
        onItemComplete?: (index: number, result: R) => void
    ): Promise<R[]> => {
        const results: R[] = new Array(items.length);
        const queue = [...items.map((item, index) => ({ item, index }))];
        
        const workers = Array(concurrency).fill(null).map(async (_, workerIndex) => {
            // Stagger initial worker start times
            if (workerIndex > 0) {
                await delay(workerIndex * (isFlash ? 1000 : 15000));
            }
            
            while (queue.length > 0) {
                const head = queue.shift();
                if (!head) break;
                const { item, index } = head;
                
                try {
                  const result = await withRetry((client) => task(item, index, client));
                  results[index] = result;
                  if (onItemComplete) onItemComplete(index, result);
                } catch (e) {
                  console.error(`Fatal error in batch ${index}:`, e);
                  throw e;
                }
                
                // Safety delay between batches
                // Pro models need significant time to reset Token TPM (10-15s)
                if (queue.length > 0) await delay(isFlash ? 2000 : 15000);
            }
        });
        
        await Promise.all(workers);
        return results;
    };

        // Stage 1: Extract Answer Key
    if (onProgress) onProgress(`Locating & Extracting Answer Key (${activeModel})...`, 5);
    
    let answerKeyText = '';
    try {
        const akPrompt = 'Act as an Answer Key Extractor. Look carefully at the LAST PAGES of this PDF document. If you find an Answer Key for the multiple-choice questions, extract the FULL answer key into a clean structured list (e.g., Q1: A, Q2: B, etc.). If there is absolutely no answer key in the document, respond with ONLY the exact word: NO_ANSWER_KEY.';
        const akResponse = await withRetry((client) => client.models.generateContent({
            model: activeModel,
            contents: [{ parts: [{ text: akPrompt }, pdfPart] }]
        }), 2);
        const text = akResponse.text?.trim() || '';
        if (text && !text.includes('NO_ANSWER_KEY')) {
            answerKeyText = text;
        }
    } catch (err) {
        console.warn('Failed to extract answer key, proceeding without it', err);
    }
    
    // Stage 2: Extraction
    if (onProgress) onProgress(`Initializing Question Extraction...`, 15);
    
    const examChunks: string[] = new Array(numBatches).fill('');
    const extractionTasks = Array.from({ length: numBatches }, (_, i) => i);
    await runInBatches(extractionTasks, maxConcurrency, async (i, index, client) => {
        const startQ = rangeStart + i * batchSize;
        const endQ = Math.min(rangeStart + (i + 1) * batchSize - 1, rangeEnd);
        
        if (onProgress) onProgress(`Extracting Q${startQ}-Q${endQ}...`, 15 + Math.floor((i / numBatches) * 40));

        const batchPrompt = EXAM_DEVELOPER_PROMPT + `\n\nEXTRACT ONLY THE FOLLOWING QUESTIONS FROM THE PDF IN ORDER: Question ${startQ} to Question ${endQ}. DO NOT EXTRACT ANY OTHER QUESTIONS.`;

        const examResponse = await client.models.generateContent({
            model: activeModel,
            contents: [
                {
                    parts: [
                        { text: batchPrompt },
                        pdfPart
                    ]
                }
            ]
        });
        
        return examResponse.text || "";
    }, (index, result) => {
        examChunks[index] = result;
        if (onPartialResult) onPartialResult({ examChunks: [...examChunks] });
    });

    // Stage 3: Solutions
    if (onProgress) onProgress(`Initializing Solution Generation...`, 55);
    
    const solutionChunks: string[] = new Array(numBatches).fill('');
    const solutionTasks = Array.from({ length: numBatches }, (_, i) => i);
    
    await runInBatches(solutionTasks, maxConcurrency, async (i, index, client) => {
        const startQ = rangeStart + i * batchSize;
        const endQ = Math.min(rangeStart + (i + 1) * batchSize - 1, rangeEnd);
        
        if (onProgress) onProgress(`Generating Solutions (Q${startQ}-Q${endQ})...`, 55 + Math.floor((i / numBatches) * 40));

        const extractedKeySection = answerKeyText ? '\n\n=== EXTRACTED ANSWER KEY ===\nHere is the answer key extracted from the end of the PDF for your reference. Use it to verify your final answers before generating explanations:\n' + answerKeyText : '';
        const solPrompt = TUTOR_PROMPT + extractedKeySection + '\n\nSolve the following batch of questions based on the document. Ensure you answer them in order and only answer the ones listed here:\n\n' + examChunks[i];

        const batchResponse = await client.models.generateContent({
           model: activeModel,
           contents: [
             {
               parts: [
                 { text: solPrompt },
                 pdfPart
               ]
             }
           ]
        });

        return (batchResponse.text?.trim() || "") + '\n\n';
    }, (index, result) => {
        solutionChunks[index] = result;
        if (onPartialResult) onPartialResult({ solutionChunks: [...solutionChunks] });
    });

    if (onProgress) onProgress("Finalizing Solutions", 100);

    return {
      formattedExam: examChunks.join('\n\n').trim(),
      solutionManual: solutionChunks.join('\n\n').trim(),
    };
  } catch (error: any) {
    if (error instanceof Error || error.message) {
      const errorMessage = error.message || JSON.stringify(error);
      if (errorMessage.includes('MIME type')) {
        throw new Error("PDF processing failed. The file format is not supported or corrupted.");
      }
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND')) {
        throw new Error(`Model Not Found (404): The '${modelName}' model is not available. Please select another model like 'Gemini 3.1 Pro' or 'Gemini Flash Latest'.`);
      }
      if (errorMessage.includes('403') || errorMessage.includes('PERMISSION_DENIED')) {
        throw new Error(`Access Denied (403): Your account/API key may not have access to the '${modelName}' model. Please select 'Gemini Flash Latest' from the Neural Engine dropdown and try again.`);
      }
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('too many requests') || errorMessage.includes('quota')) {
        throw new Error(`Rate Limit Exceeded (429): Your API key hit its usage limits (Tokens Per Minute or Requests Per Minute). Wait a minute and try again, or reduce the number of questions. Even Pro accounts have limits based on your billing tier.`);
      }
      throw new Error(`AI processing failed: ${errorMessage}`);
    }
    throw new Error("An unexpected error occurred during PDF parsing and AI processing.");
  }
}
