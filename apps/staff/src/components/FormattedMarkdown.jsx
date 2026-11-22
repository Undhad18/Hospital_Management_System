import React from "react";

/**
 * Tokenizes an inline string to convert **bold**, *italic*, and `code` into React elements
 * without leaving raw markdown characters like * or ` in the output.
 */
function renderInline(text, keyPrefix = "inline") {
  if (!text) return null;

  const tokens = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;
  let tokenIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(
        <React.Fragment key={`${keyPrefix}-txt-${tokenIdx++}`}>
          {text.substring(lastIndex, match.index)}
        </React.Fragment>
      );
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      tokens.push(
        <strong key={`${keyPrefix}-b-${tokenIdx++}`} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      tokens.push(
        <em key={`${keyPrefix}-i-${tokenIdx++}`} className="italic text-slate-600">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      tokens.push(
        <code
          key={`${keyPrefix}-c-${tokenIdx++}`}
          className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-800 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(
      <React.Fragment key={`${keyPrefix}-txt-${tokenIdx++}`}>
        {text.substring(lastIndex)}
      </React.Fragment>
    );
  }

  return tokens.length > 0 ? tokens : text;
}

/**
 * Parses markdown text into structured blocks (headings, lists, blockquotes, paragraphs)
 */
function parseBlocks(markdown) {
  if (!markdown) return [];
  const lines = String(markdown).split("\n");
  const blocks = [];
  let currentList = null;

  const flushList = () => {
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    // Heading: ### Heading or ## Heading or # Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    // Blockquote: > text
    const quoteMatch = line.match(/^>\s*(.*)$/);
    if (quoteMatch) {
      flushList();
      blocks.push({
        type: "blockquote",
        text: quoteMatch[1],
      });
      continue;
    }

    // Unordered list item: - item or * item
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (!currentList || currentList.type !== "ul") {
        flushList();
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(ulMatch[1]);
      continue;
    }

    // Ordered list item: 1. item
    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (!currentList || currentList.type !== "ol") {
        flushList();
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push({ num: olMatch[1], text: olMatch[2] });
      continue;
    }

    // Normal paragraph
    flushList();
    blocks.push({
      type: "paragraph",
      text: line,
    });
  }

  flushList();
  return blocks;
}

/**
 * Pure React component that formats markdown into styled UI without raw # or * symbols.
 */
export default function FormattedMarkdown({ content, className = "" }) {
  if (!content) return null;

  const blocks = parseBlocks(content);

  return (
    <div className={`space-y-2.5 text-xs text-slate-800 leading-relaxed font-sans ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h1
                key={idx}
                className="text-base font-bold text-slate-900 pb-1.5 border-b border-slate-200 mt-2 flex items-center space-x-2"
              >
                {renderInline(block.text, `h1-${idx}`)}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2
                key={idx}
                className="text-sm font-bold text-slate-900 pb-1 border-b border-slate-200 mt-2 flex items-center space-x-1.5"
              >
                {renderInline(block.text, `h2-${idx}`)}
              </h2>
            );
          }
          // level >= 3
          return (
            <h3
              key={idx}
              className="text-xs font-bold text-slate-900 pb-1 border-b border-slate-200/80 mt-1.5 flex items-center space-x-1.5"
            >
              {renderInline(block.text, `h3-${idx}`)}
            </h3>
          );
        }

        if (block.type === "ul") {
          return (
            <ul key={idx} className="space-y-1.5 my-1 pl-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start space-x-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                  <span className="flex-1">{renderInline(item, `ul-${idx}-${itemIdx}`)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          return (
            <ol key={idx} className="space-y-1.5 my-1 pl-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start space-x-2 text-xs">
                  <span className="w-4 h-4 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {item.num}
                  </span>
                  <span className="flex-1">{renderInline(item.text, `ol-${idx}-${itemIdx}`)}</span>
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={idx}
              className="my-2 p-3 bg-amber-50/70 border-l-3 border-amber-500 rounded-r-lg text-amber-900 text-xs shadow-2xs"
            >
              {renderInline(block.text, `quote-${idx}`)}
            </blockquote>
          );
        }

        // Paragraph
        return (
          <p key={idx} className="my-1">
            {renderInline(block.text, `p-${idx}`)}
          </p>
        );
      })}
    </div>
  );
}
