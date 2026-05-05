// server.ts
import express from "express";
import path from "path";
import { mdToPdf } from "md-to-pdf";
async function startServer() {
  const app = express();
  const PORT = 3e3;
  app.use(express.json({ limit: "50mb" }));
  app.post("/api/pdf", async (req, res) => {
    try {
      const { markdown, theme } = req.body;
      if (!markdown) {
        return res.status(400).json({ error: "Markdown content is required" });
      }
      const css = `
        body { font-family: 'Inter', sans-serif; background-color: ${theme === "dark" ? "#121212" : "#FFFFFF"}; color: ${theme === "dark" ? "#E5E5E5" : "#1A1A1A"}; }
        h1, h2, h3, h4, h5, h6 { font-family: 'Playfair Display', serif; color: ${theme === "dark" ? "#FFFFFF" : "#000000"}; }
        pre, code { font-family: 'JetBrains Mono', monospace; }
        code { background-color: ${theme === "dark" ? "#2d2d2d" : "#f5f5f5"}; padding: 2px 4px; border-radius: 4px; }
        pre { background-color: ${theme === "dark" ? "#2d2d2d" : "#f5f5f5"}; padding: 1em; overflow-x: auto; border-radius: 4px; }
        pre code { padding: 0; background-color: transparent; }
        img { max-width: 100%; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
        th, td { border: 1px solid ${theme === "dark" ? "#444" : "#ddd"}; padding: 8px; }
        a { color: ${theme === "dark" ? "#60a5fa" : "#2563eb"}; }
      `;
      let rawMarkdown = markdown;
      const scriptsInjection = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body, {delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}]});"></script>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: false, theme: '${theme === "dark" ? "dark" : "default"}' });
  document.addEventListener("DOMContentLoaded", async () => {
    const mermaidBlocks = document.querySelectorAll('code.language-mermaid');
    for (let i = 0; i < mermaidBlocks.length; i++) {
        const block = mermaidBlocks[i];
        const text = block.textContent;
        const parent = block.parentElement;
        const id = 'mermaid-' + i;
        const { svg } = await mermaid.render(id, text);
        const div = document.createElement('div');
        div.innerHTML = svg;
        parent.replaceWith(div);
    }
  });
</script>

`;
      rawMarkdown = scriptsInjection + rawMarkdown;
      const pdf = await mdToPdf(
        { content: rawMarkdown },
        {
          css,
          launch_options: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
          pdf_options: { format: "A4", margin: { top: "15mm", right: "10mm", bottom: "15mm", left: "10mm" }, printBackground: true }
        }
      );
      if (pdf) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'attachment; filename="document.pdf"');
        res.send(Buffer.from(pdf.content));
      } else {
        throw new Error("PDF generation returned null");
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ error: "Failed to generate PDF", details: error.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on http://localhost:" + PORT);
  });
}
startServer();
