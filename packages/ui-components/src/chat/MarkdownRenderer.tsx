import React from 'react';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
}

interface ParsedBlock {
  type: 'text' | 'code' | 'heading' | 'list' | 'ordered-list' | 'table' | 'hr' | 'blockquote';
  content: string;
  language?: string;
  level?: number;
  /** Table: parsed rows (header + data). Each row is array of cell strings. */
  rows?: string[][];
  /** Table: alignment per column ('left' | 'center' | 'right' | null). */
  alignments?: Array<'left' | 'center' | 'right' | null>;
}

function parseBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const language = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), language: language || undefined });
      continue;
    }

    // Horizontal rule (---, ***, ___)
    if (line.match(/^\s*([-*_])\s*\1\s*\1[\s\1]*$/)) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[2], level: headingMatch[1].length });
      i++;
      continue;
    }

    // Blockquote — collect contiguous > lines
    if (line.match(/^\s*>\s?/)) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*>\s?/)) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    // Table — detect | header | header | pattern
    if (line.match(/^\s*\|/) && i + 1 < lines.length && lines[i + 1].match(/^\s*\|[\s:|-]+\|/)) {
      const tableRows: string[][] = [];
      let alignments: Array<'left' | 'center' | 'right' | null> = [];

      // Header row
      tableRows.push(parseTableRow(line));
      i++;

      // Separator row (parse alignments)
      if (i < lines.length) {
        alignments = parseTableAlignments(lines[i]);
        i++;
      }

      // Data rows
      while (i < lines.length && lines[i].match(/^\s*\|/)) {
        tableRows.push(parseTableRow(lines[i]));
        i++;
      }

      blocks.push({ type: 'table', content: '', rows: tableRows, alignments });
      continue;
    }

    // Ordered list (1. item, 2. item)
    if (line.match(/^\s*\d+\.\s/)) {
      const listLines: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) {
        listLines.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      blocks.push({ type: 'ordered-list', content: listLines.join('\n') });
      continue;
    }

    // Unordered list items — collect contiguous
    if (line.match(/^\s*[-*•]\s/)) {
      const listLines: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*•]\s/)) {
        listLines.push(lines[i].replace(/^\s*[-*•]\s/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: listLines.join('\n') });
      continue;
    }

    // Regular text — collect contiguous non-empty lines
    const textLines: string[] = [];
    while (
      i < lines.length &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^#{1,4}\s/) &&
      !lines[i].match(/^\s*[-*•]\s/) &&
      !lines[i].match(/^\s*\d+\.\s/) &&
      !lines[i].match(/^\s*>\s?/) &&
      !lines[i].match(/^\s*\|/) &&
      !lines[i].match(/^\s*([-*_])\s*\1\s*\1[\s\1]*$/)
    ) {
      textLines.push(lines[i]);
      i++;
    }
    const combined = textLines.join('\n').trim();
    if (combined) {
      blocks.push({ type: 'text', content: combined });
    }
  }

  return blocks;
}

/** Parse a table row: "| a | b | c |" → ["a", "b", "c"] */
function parseTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** Parse alignment row: "|:---|:---:|---:|" → ['left', 'center', 'right'] */
function parseTableAlignments(line: string): Array<'left' | 'center' | 'right' | null> {
  return parseTableRow(line).map((cell) => {
    const trimmed = cell.replace(/\s/g, '');
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
    if (trimmed.endsWith(':')) return 'right';
    if (trimmed.startsWith(':')) return 'left';
    return null;
  });
}

/** Render inline markdown: bold, italic, code, links */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Pattern: **bold**, *italic*, `code`, [text](url)
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // Italic
      parts.push(<em key={match.index}>{match[4]}</em>);
    } else if (match[5]) {
      // Inline code
      parts.push(<code key={match.index} className="md-inline-code">{match[6]}</code>);
    } else if (match[7]) {
      // Link
      parts.push(
        <a key={match.index} href={match[8]} target="_blank" rel="noopener noreferrer" className="md-link">
          {match[7]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function CodeBlock({ content, language }: { content: string; language?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="md-code-block">
      <div className="md-code-block__header">
        <span className="md-code-block__lang">{language || 'text'}</span>
        <button className="md-code-block__copy" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="md-code-block__pre">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function TableBlock({ rows, alignments }: { rows: string[][]; alignments?: Array<'left' | 'center' | 'right' | null> }) {
  if (!rows || rows.length === 0) return null;
  const [header, ...body] = rows;

  return (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i} style={{ textAlign: alignments?.[i] ?? undefined }}>
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        {body.length > 0 && (
          <tbody>
            {body.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ textAlign: alignments?.[j] ?? undefined }}>
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const blocks = parseBlocks(content);

  return (
    <div className="md-content">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'code':
            return <CodeBlock key={i} content={block.content} language={block.language} />;

          case 'heading': {
            const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
            return <Tag key={i} className={`md-heading md-h${block.level}`}>{renderInline(block.content)}</Tag>;
          }

          case 'list':
            return (
              <ul key={i} className="md-list">
                {block.content.split('\n').map((item, j) => (
                  <li key={j} className="md-list__item">{renderInline(item)}</li>
                ))}
              </ul>
            );

          case 'ordered-list':
            return (
              <ol key={i} className="md-list md-list--ordered">
                {block.content.split('\n').map((item, j) => (
                  <li key={j} className="md-list__item">{renderInline(item)}</li>
                ))}
              </ol>
            );

          case 'table':
            return <TableBlock key={i} rows={block.rows!} alignments={block.alignments} />;

          case 'hr':
            return <hr key={i} className="md-hr" />;

          case 'blockquote':
            return (
              <blockquote key={i} className="md-blockquote">
                {block.content.split('\n').map((line, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <br />}
                    {renderInline(line)}
                  </React.Fragment>
                ))}
              </blockquote>
            );

          case 'text':
            return (
              <div key={i} className="md-paragraph">
                {block.content.split('\n').map((line, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <br />}
                    {renderInline(line)}
                  </React.Fragment>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
