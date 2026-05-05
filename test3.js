import { mdToPdf } from 'md-to-pdf';
import * as fs from 'fs';

async function testPdf() {
  const css = `
    html, body {
      background-color: #1C1C1E !important;
      color: #E5E5E5;
      -webkit-print-color-adjust: exact;
    }
  `;
  const pdfWithMargins = await mdToPdf(
    { content: '# Hello\n\nThis is a test document spanning multiple lines to see margins.\n\n<div style="page-break-after: always;"></div>\n\n# Page 2' },
    { 
      css: css,
      launch_options: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
      pdf_options: { format: 'A4', margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' }, printBackground: true }
    }
  );
  fs.writeFileSync('test3.pdf', pdfWithMargins.content);
}

testPdf().catch(console.error);
