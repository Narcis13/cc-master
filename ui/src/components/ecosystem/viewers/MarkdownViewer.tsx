import { h } from "preact";

function mdToHtml(md: string): string {
  let html = md;
  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="eco-md-code"><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="eco-md-inline">$1</code>');
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h4 class="eco-md-h3">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="eco-md-h2">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="eco-md-h1">$1</h2>');
  // Bold + italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="eco-md-link">$1</a>');
  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="eco-md-li">$1</li>');
  // Paragraphs (blank line separated)
  html = html.replace(/\n\n/g, "</p><p>");
  return `<p>${html}</p>`;
}

export function MarkdownViewer({ content }: { content: string }) {
  return (
    <div class="eco-md-viewer" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />
  );
}
