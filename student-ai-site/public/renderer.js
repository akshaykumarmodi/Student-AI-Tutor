function escapeHtml(str) {
  if (typeof str !== 'string') {
    return '';
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanFormula(formula) {
  if (!formula || typeof formula !== 'string') {
    return '';
  }
  let clean = formula.trim();
  clean = clean.replace(/[\u2000-\u200B\u202F\u00A0]/g, ' ');
  clean = clean.replace(/\u2212/g, '-');
  clean = clean.replace(/\u00D7/g, '\\times ');
  clean = clean.replace(/\u00F7/g, '\\div ');
  clean = clean.replace(/\u2248/g, '\\approx ');
  clean = clean.replace(/\u2264/g, '\\le ');
  clean = clean.replace(/\u2265/g, '\\ge ');
  clean = clean.replace(/\u2260/g, '\\ne ');
  clean = clean.replace(/\u00B1/g, '\\pm ');
  clean = clean.replace(/\u00B0/g, '^\\circ ');
  clean = clean.replace(/\u00B7/g, '\\cdot ');
  clean = clean.replace(/\u2026/g, '\\dots ');
  clean = clean.replace(/\u2192/g, '\\to ');
  clean = clean.replace(/\\\\([a-zA-Z])/g, '\\$1');
  return clean;
}

function renderMathToHtml(formula, isDisplay) {
  const clean = cleanFormula(formula);
  if (!clean) {
    return '';
  }
  if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
    try {
      return window.katex.renderToString(clean, {
        displayMode: isDisplay,
        throwOnError: false,
        trust: false,
        strict: false
      });
    } catch {
      const escaped = escapeHtml(clean);
      return isDisplay
        ? `<div class="katex-raw display">\\[${escaped}\\]</div>`
        : `<span class="katex-raw inline">\\(${escaped}\\)</span>`;
    }
  }
  const escaped = escapeHtml(clean);
  return isDisplay
    ? `<div class="math-block-wrapper"><div class="math-display katex-raw">\\[${escaped}\\]</div></div>`
    : `<span class="math-inline katex-raw">\\(${escaped}\\)</span>`;
}

function normalizeEscapedMarkdown(raw) {
  if (!raw || typeof raw !== 'string') {
    return '';
  }
  let s = raw.replace(/\r\n/g, '\n');
  s = s.replace(/\\\*\\\*([^*\n]+?)\\\*\\\*/g, '**$1**');
  s = s.replace(/\\\_\\\_([^_\n]+?)\\\_\\\_/g, '__$1__');
  s = s.replace(/\\\*([^*\n]+?)\\\*/g, '*$1*');
  s = s.replace(/\\\_([^_\n]+?)\\\_/g, '_$1_');
  s = s.replace(/\\~\\~([^~\n]+?)\\~\\~/g, '~~$1~~');
  s = s.replace(/(?:^|\n|[ \t]+)((?:\\#){1,6}|\\#{1,6})[ \t]+/g, (match, hashes) => {
    const count = (hashes.match(/#/g) || []).length;
    return '\n' + '#'.repeat(count) + ' ';
  });
  s = s.replace(/(^|\n)[ \t]*\\\*[ \t]+/g, '$1* ');
  s = s.replace(/(^|\n)[ \t]*\\\-[ \t]+/g, '$1- ');
  s = s.replace(/(^|\n)[ \t]*\\\+[ \t]+/g, '$1+ ');
  s = s.replace(/(^|\n)[ \t]*\\(\d+)\.[ \t]+/g, '$1$2. ');
  return s;
}

function balanceStreamingText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }
  let text = rawText;
  const codeFenceMatches = text.match(/```/g);
  if (codeFenceMatches && codeFenceMatches.length % 2 !== 0) {
    text += '\n```';
  }
  const doubleDollarMatches = text.match(/\$\$/g);
  if (doubleDollarMatches && doubleDollarMatches.length % 2 !== 0) {
    text += '\n$$';
  }
  const openBracketMatches = text.match(/\\\[/g) || [];
  const closeBracketMatches = text.match(/\\\]/g) || [];
  if (openBracketMatches.length > closeBracketMatches.length) {
    text += '\\]';
  }
  const beginMatches = text.match(/\\begin\{([a-zA-Z*]+)\}/g) || [];
  const endMatches = text.match(/\\end\{([a-zA-Z*]+)\}/g) || [];
  if (beginMatches.length > endMatches.length) {
    const lastBegin = beginMatches[beginMatches.length - 1];
    const envMatch = lastBegin.match(/\\begin\{([a-zA-Z*]+)\}/);
    if (envMatch && envMatch[1]) {
      text += `\\end{${envMatch[1]}}`;
    }
  }
  return text;
}

function normalizeLanguage(lang) {
  if (!lang) {
    return 'text';
  }
  const clean = lang.trim().toLowerCase();
  const map = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    terminal: 'bash',
    console: 'bash',
    cplusplus: 'cpp',
    'c++': 'cpp',
    yml: 'yaml',
    rb: 'ruby',
    golang: 'go',
    rs: 'rust',
    htm: 'html',
    md: 'markdown'
  };
  return map[clean] || clean;
}

function highlightCode(code, lang) {
  const normLang = normalizeLanguage(lang);
  if (typeof window !== 'undefined' && window.Prism && window.Prism.languages) {
    const grammar = window.Prism.languages[normLang];
    if (grammar) {
      try {
        return window.Prism.highlight(code, grammar, normLang);
      } catch {
        return escapeHtml(code);
      }
    }
  }
  return escapeHtml(code);
}

function fallbackMarkdownParse(md) {
  let text = escapeHtml(md);

  text = text.replace(/((?:^[ \t]*\|[^\n]+\|[ \t]*(?:\n|$))+)/gm, (match) => {
    const lines = match.trim().split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return match;
    }
    const isDivider = /^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[1]);
    if (!isDivider) {
      return match;
    }
    const splitCells = (l) => l.slice(1, -1).split('|').map(c => c.trim());
    const headers = splitCells(lines[0]);
    const ths = headers.map(h => `<th>${h}</th>`).join('');
    const rows = lines.slice(2).map(r => {
      const cells = splitCells(r);
      const tds = cells.map(c => `<td>${c}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  text = text.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
  text = text.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
  text = text.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  text = text.replace(/\*\*\*([^\*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^\*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  text = text.replace(/^---$/gim, '<hr>');
  text = text.replace(/^\*\*\*$/gim, '<hr>');

  text = text.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  text = text.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  text = text.replace(/\n\n+/g, '</p><p>');
  text = `<p>${text}</p>`;
  text = text.replace(/<p>\s*<\/p>/g, '');
  return text;
}

export function renderUniversalResponse(rawText, options = {}) {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  const isStreaming = Boolean(options.isStreaming);
  const normalized = normalizeEscapedMarkdown(rawText);
  const workingText = isStreaming ? balanceStreamingText(normalized) : normalized;

  const codeBlocks = [];
  const mathBlocks = [];

  let processed = workingText.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
    const token = `UMCODEBLOCK${codeBlocks.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const cleanLang = normalizeLanguage(lang);
    codeBlocks.push({ token, lang: cleanLang, code });
    return token;
  });

  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    const token = `UMMATHDISP${mathBlocks.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<div class="math-block-wrapper"><div class="math-display">${renderMathToHtml(formula, true)}</div></div>`;
    mathBlocks.push({ token, html });
    return token;
  });

  processed = processed.replace(/(?:\\\\\[|\\\[)([\s\S]*?)(?:\\\\\]|\\\])/g, (match, formula) => {
    const token = `UMMATHDISP${mathBlocks.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<div class="math-block-wrapper"><div class="math-display">${renderMathToHtml(formula, true)}</div></div>`;
    mathBlocks.push({ token, html });
    return token;
  });

  processed = processed.replace(/\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g, (match) => {
    const token = `UMMATHDISP${mathBlocks.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<div class="math-block-wrapper"><div class="math-display">${renderMathToHtml(match, true)}</div></div>`;
    mathBlocks.push({ token, html });
    return token;
  });

  processed = processed.replace(/(?:\\\\\(|\\\()([\s\S]*?)(?:\\\\\)|\\\))/g, (match, formula) => {
    const token = `UMMATHINL${mathBlocks.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<span class="math-inline">${renderMathToHtml(formula, false)}</span>`;
    mathBlocks.push({ token, html });
    return token;
  });

  processed = processed.replace(/(?<![\w\\])\$(?!\s)([^$\n\r]+?)(?<![\s\\])\$(?!\d)/g, (match, formula) => {
    const token = `UMMATHINL${mathBlocks.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<span class="math-inline">${renderMathToHtml(formula, false)}</span>`;
    mathBlocks.push({ token, html });
    return token;
  });

  const citations = [];

  processed = processed.replace(/\[(\d+(?:\s*,\s*\d+)*|\d+\s*-\s*\d+)\]\((https?:\/\/[^\s)]+)\)/g, (match, cite, url) => {
    const token = `UMCITELINK${citations.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="citation-pill link" title="Source ${cite}">[${cite}]</a>`;
    citations.push({ token, html });
    return token;
  });

  processed = processed.replace(/(?<=\s|^)\[(\d+(?:\s*,\s*\d+)*|\d+\s*-\s*\d+)\](?=[.,;:!?\s]|$)/g, (match, cite) => {
    const token = `UMCITEPILL${citations.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<span class="citation-pill" data-cite="${cite}">[${cite}]</span>`;
    citations.push({ token, html });
    return token;
  });

  processed = processed.replace(/\[\^(\d+)\]/g, (match, num) => {
    const token = `UMCITEFOOT${citations.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<sup class="footnote-ref"><span class="citation-pill mini">[${num}]</span></sup>`;
    citations.push({ token, html });
    return token;
  });

  processed = processed.replace(/\[(?:Source|Reference|Ref|Citation):\s*([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (match, src, url) => {
    const token = `UMCITESRC${citations.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="source-badge link" title="Referenced Source"><span class="badge-icon">📚</span><span class="badge-text">${escapeHtml(src)}</span></a>`;
    citations.push({ token, html });
    return token;
  });

  processed = processed.replace(/\[(?:Source|Reference|Ref|Citation):\s*([^\]]+)\]/gi, (match, src) => {
    const token = `UMCITESRC${citations.length}X${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
    const html = `<span class="source-badge" title="Referenced Source"><span class="badge-icon">📚</span><span class="badge-text">${escapeHtml(src)}</span></span>`;
    citations.push({ token, html });
    return token;
  });

  let parsedHtml = '';
  if (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
    try {
      parsedHtml = window.marked.parse(processed, {
        gfm: true,
        breaks: true
      });
    } catch {
      parsedHtml = fallbackMarkdownParse(processed);
    }
  } else {
    parsedHtml = fallbackMarkdownParse(processed);
  }

  for (let i = 0; i < mathBlocks.length; i++) {
    const { token, html } = mathBlocks[i];
    parsedHtml = parsedHtml.split(token).join(html);
  }

  for (let i = 0; i < citations.length; i++) {
    const { token, html } = citations[i];
    parsedHtml = parsedHtml.split(token).join(html);
  }

  for (let i = 0; i < codeBlocks.length; i++) {
    const { token, lang, code } = codeBlocks[i];
    const highlighted = highlightCode(code, lang);
    const isTerminal = ['bash', 'sh', 'shell', 'terminal', 'zsh', 'console'].includes(lang);
    const displayLang = isTerminal ? 'TERMINAL' : (lang ? lang.toUpperCase() : 'CODE');
    const encodedRaw = encodeURIComponent(code);

    const blockHtml = `
      <div class="code-block-wrapper ${isTerminal ? 'terminal-block' : ''}">
        <div class="code-block-header">
          <div class="code-meta">
            ${isTerminal ? '<span class="term-dots"><i></i><i></i><i></i></span>' : ''}
            <span class="code-lang">${escapeHtml(displayLang)}</span>
          </div>
          <button type="button" class="copy-code-btn" data-code="${encodedRaw}" aria-label="Copy code snippet">
            <svg class="copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="copy-btn-text">Copy</span>
          </button>
        </div>
        <pre class="code-pre"><code class="language-${escapeHtml(lang)} ${isTerminal ? 'terminal-content' : ''}">${highlighted}</code></pre>
      </div>
    `;
    parsedHtml = parsedHtml.split(token).join(blockHtml);
  }

  parsedHtml = parsedHtml.replace(/<table(?:\s+[^>]*)?>([\s\S]*?)<\/table>/gi, (match) => {
    return `<div class="table-responsive">${match}</div>`;
  });

  if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    try {
      parsedHtml = window.DOMPurify.sanitize(parsedHtml, {
        ADD_TAGS: [
          'math', 'annotation', 'semantics', 'mtext', 'mn', 'mo', 'mi', 'mspace',
          'mover', 'munder', 'mfrac', 'msup', 'msub', 'msubsup', 'msqrt', 'mroot',
          'mtable', 'mtr', 'mtd', 'svg', 'path', 'rect', 'circle', 'line', 'polygon',
          'polyline', 'sup', 'sub', 'del', 'i'
        ],
        ADD_ATTR: [
          'target', 'rel', 'data-code', 'data-lang', 'data-cite', 'aria-hidden',
          'aria-label', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
          'stroke-linejoin', 'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'points',
          'displayMode'
        ]
      });
    } catch {}
  }

  return parsedHtml;
}
