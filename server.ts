import express from "express";
import fs from "fs/promises";
import path from "path";
import { mdToPdf } from "md-to-pdf";
import katex from "katex";

import { marked } from "marked";
import markedKatex from "marked-katex-extension";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configure marked with KaTeX
  marked.use(markedKatex({
    throwOnError: false,
    displayMode: true,
    nonStandard: true // Supports $ for inline math
  }));

  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.post("/api/pdf", async (req, res) => {
    console.log(`[${new Date().toISOString()}] POST /api/pdf - Received request`);
    try {
      const { markdown, theme } = req.body;
      if (!markdown) {
        console.warn("PDF generation failed: No markdown content provided");
        return res.status(400).json({ error: "Markdown content is required" });
      }

      const css = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;1,700&family=JetBrains+Mono:wght@400;500&display=swap');
        @import url('https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css');
        
        html, body { 
          font-family: 'Inter', sans-serif; 
          background-color: ${theme === 'dark' ? '#1C1C1E' : '#FFFFFF'} !important; 
          color: ${theme === 'dark' ? '#F5F5F7' : '#1A1A1A'}; 
          -webkit-print-color-adjust: exact;
          line-height: 1.6;
        }
        
        @media print {
          body { background-color: white !important; color: black !important; }
          .dark body { background-color: #1C1C1E !important; color: #F5F5F7 !important; }
        }

        h1, h2, h3, h4, h5, h6 { 
          font-family: 'Playfair Display', serif; 
          color: ${theme === 'dark' ? '#FFFFFF' : '#000000'}; 
          margin-top: 1.5em;
          margin-bottom: 0.8em;
        }
        
        h1 { font-size: 2.2em; border-bottom: 2px solid ${theme === 'dark' ? '#3A3A3E' : '#1A1A1A'}; padding-bottom: 0.3em; }
        
        pre, code { font-family: 'JetBrains Mono', monospace; }
        code { 
          background-color: ${theme === 'dark' ? '#2C2C2E' : '#F3F4F6'}; 
          padding: 0.2em 0.4em; 
          border-radius: 4px; 
          font-size: 0.9em;
        }
        
        pre { 
          background-color: ${theme === 'dark' ? '#2C2C2E' : '#F3F4F6'}; 
          padding: 1.2em; 
          overflow-x: auto; 
          border-radius: 8px; 
          border: 1px solid ${theme === 'dark' ? '#3A3A3E' : '#E5E7EB'};
          margin: 1.5em 0;
        }
        
        pre code { padding: 0; background-color: transparent; }
        
        img, svg { max-width: 100%; height: auto; display: block; margin: 1.5em auto; }
        
        table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
        th, td { border: 1px solid ${theme === 'dark' ? '#3A3A3E' : '#D1D5DB'}; padding: 12px; text-align: left; }
        th { background-color: ${theme === 'dark' ? '#2C2C2E' : '#F9FAFB'}; font-weight: 600; }
        
        a { color: ${theme === 'dark' ? '#60a5fa' : '#2563eb'}; text-decoration: none; }
        
        hr { border: none; border-top: 1px solid ${theme === 'dark' ? '#3A3A3E' : '#E5E7EB'}; margin: 3em 0; }
        
        blockquote { 
          border-left: 4px solid ${theme === 'dark' ? '#3A3A3E' : '#D1D5DB'}; 
          padding-left: 1.5em; 
          color: ${theme === 'dark' ? '#9E9D9F' : '#4B5563'}; 
          font-style: italic;
          margin: 1.5em 0;
        }

        p { margin-bottom: 1.2em; text-align: justify; }
        
        /* Options list spacing */
        ul, ol { margin-bottom: 1.5em; padding-left: 2em; }
        li { margin-bottom: 0.8em; }

        /* Mermaid styling */
        .mermaid {
          display: flex;
          justify-content: center;
          margin: 2em 0;
          background: white;
          padding: 1em;
          border-radius: 8px;
        }
        
        /* KaTeX specific refinements */
        .katex { font-size: 1.1em; }
        .katex-display { 
          margin: 2.5em 0 !important; 
          padding: 1.5em;
          background-color: ${theme === 'dark' ? '#232325' : '#FCFCFD'};
          border-radius: 8px;
          overflow-x: auto;
          overflow-y: hidden;
          border: 1px solid ${theme === 'dark' ? '#3A3A3E' : '#EEEDE7'};
        }
        .katex-display > .katex {
          white-space: normal;
          display: block;
        }
        /* Ensure KaTeX fonts load */
        .katex .mathnormal { font-family: KaTeX_Math; font-style: italic; }
      `;

      let rawMarkdown = markdown;

      // Ensure math delimiters are standard before processing
      // Some models might use \[ \] for blocks or \( \) for inline
      rawMarkdown = rawMarkdown.replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$');
      rawMarkdown = rawMarkdown.replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$');
      
      // Fix double escaped dollar signs if any
      rawMarkdown = rawMarkdown.replace(/\\(\$)/g, '$1');

      // Fix indented block equations from being parsed as code blocks
      rawMarkdown = rawMarkdown.replace(/^(\s*)\$\$(?!\$)/gm, '$$$$');

      // Convert Mermaid code blocks into static images via kroki.io
      const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
      const mermaidMatches = Array.from(rawMarkdown.matchAll(mermaidRegex));
      
      const mermaidPromises = mermaidMatches.map(async (match) => {
        let code = match[1].trim();
        // Inject theme if not already present
        if (!code.startsWith('%%{init')) {
           code = `%%{init: {'theme': '${theme === 'dark' ? 'dark' : 'default'}'}}%%\n${code}`;
        }
        try {
          const svgResponse = await fetch('https://kroki.io/mermaid/svg', {
            method: 'POST',
            body: code,
            headers: { 'Content-Type': 'text/plain' }
          });
          
          if (svgResponse.ok) {
             const svgText = await svgResponse.text();
             return { original: match[0], replacement: `\n\n<div style="text-align: center; margin: 2em 0;">\n${svgText}\n</div>\n\n` };
          } else {
             const errText = await svgResponse.text();
             console.warn("Kroki Mermaid Error:", errText);
             return { original: match[0], replacement: `\n\n<div style="text-align: center; margin: 2em 0; color: #dc2626; border: 1px solid #f87171; padding: 1em; border-radius: 4px;"><b>Notice:</b> Mermaid diagram generation failed. The AI generated invalid Mermaid syntax.</div>\n<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>\n\n` };
          }
        } catch (e) {
          console.error("Kroki encoding failed", e);
          return null;
        }
      });

      const mermaidReplacements = (await Promise.all(mermaidPromises)).filter((r): r is { original: string, replacement: string } => r !== null);
      for (const rep of mermaidReplacements) {
        rawMarkdown = rawMarkdown.replace(rep.original, rep.replacement);
      }

      console.log(`Starting PDF generation for theme: ${theme}`);

      // Apply marked-katex-extension via marked_extensions (casting to avoid TS error)
      const pdfOptions: any = { 
        css: css,
        stylesheet: ['https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css'],
        marked_options: {
          gfm: true,
        },
        marked_extensions: [
          markedKatex({
            throwOnError: false,
            displayMode: true,
            nonStandard: true
          })
        ],
        pdf_options: { 
          format: 'A4', 
          margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' }, 
          printBackground: true,
          timeout: 120000 
        },
        launch_options: { 
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--font-render-hinting=none'
          ],
          headless: true
        }
      };

      const pdf = await mdToPdf(
        { content: rawMarkdown },
        pdfOptions
      ).catch(e => {
        console.error("Puppeteer/md-to-pdf crash caught:", e);
        throw e;
      });

      if (pdf && pdf.content) {
        console.log(`[${new Date().toISOString()}] PDF generated successfully: ${pdf.content.length} bytes`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="document.pdf"`);
        res.send(Buffer.from(pdf.content));
      } else {
        console.error("PDF generation returned empty content");
        res.status(500).json({ error: "Failed to generate PDF content" });
      }
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] PDF Generation Error:`, error);
      res.status(500).json({ 
        error: "PDF Generation Failed", 
        message: error.message 
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on http://localhost:" + PORT);
  });
}

startServer();
