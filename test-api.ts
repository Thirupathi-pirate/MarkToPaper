import fs from 'fs';

async function testPdf() {
  const markdown = `
# Math Test
Block math:
$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

Inline math: $E=mc^2$

# Mermaid Test
\`\`\`mermaid
graph TD
  A[Start] --> B{Is it working?};
  B -- Yes --> C[Great!];
  B -- No --> D[Debug];
\`\`\`
  `;

  try {
    const res = await fetch('http://localhost:3000/api/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        markdown: markdown,
        theme: 'light'
      })
    });

    if (!res.ok) {
      console.error("API failed with status", res.status, await res.text());
      return;
    }

    const buffer = await res.arrayBuffer();
    fs.writeFileSync('test.pdf', Buffer.from(buffer));
    console.log("Successfully wrote test.pdf, size:", buffer.byteLength);
  } catch(e) {
    console.error("Fetch failed", e);
  }
}

testPdf();
