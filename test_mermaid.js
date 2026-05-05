const markdown = `# Test
$$
E = mc^2
$$

\`\`\`mermaid
graph TD
  A-->B;
\`\`\`
`;

async function run() {
  const r = await fetch('http://localhost:3000/api/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, theme: 'light' })
  });
  if (r.ok) {
    console.log("PDF generated OK");
  } else {
    console.log("PDF generation failed:", await r.text());
  }
}
run();
