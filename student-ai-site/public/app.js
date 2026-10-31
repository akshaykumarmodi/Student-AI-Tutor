const STORAGE_KEY = 'student_ai_tutor_v1';

let history = [];
let abortController = null;
let isStreaming = false;

const chatViewport = document.getElementById('chatViewport');
const emptyState = document.getElementById('emptyState');
const messagesList = document.getElementById('messagesList');
const typingIndicator = document.getElementById('typingIndicator');
const chatForm = document.getElementById('chatForm');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const subjectSelect = document.getElementById('subjectSelect');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const clearChatBtn = document.getElementById('clearChatBtn');
const chipsContainer = document.getElementById('chipsContainer');

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(rawText) {
  if (!rawText) {
    return '';
  }

  const codeBlocks = [];
  let processed = rawText.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const cleanLang = lang ? lang.trim() : 'text';
    const escapedCode = escapeHtml(code.trimEnd());
    codeBlocks.push({ lang: cleanLang, code: escapedCode, rawCode: code });
    return placeholder;
  });

  let escaped = escapeHtml(processed);

  escaped = escaped.replace(/`([^`\n]+)`/g, (match, code) => {
    return `<code class="inline-code">${code}</code>`;
  });

  escaped = escaped.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  escaped = escaped.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  escaped = escaped.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/~~(.*?)~~/g, '<del>$1</del>');

  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, text, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  escaped = escaped.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  escaped = escaped.replace(/^(\d+)\. (.*$)/gim, '<div class="list-item num"><span class="num-idx">$1.</span> $2</div>');
  escaped = escaped.replace(/^[-*] (.*$)/gim, '<div class="list-item bullet"><span class="bullet-dot">•</span> $1</div>');

  escaped = escaped.replace(/\n\n+/g, '</p><p>');
  escaped = `<p>${escaped}</p>`;
  escaped = escaped.replace(/<p>\s*<\/p>/g, '');

  for (let i = 0; i < codeBlocks.length; i++) {
    const item = codeBlocks[i];
    const blockHtml = `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span>${item.lang}</span>
          <button type="button" class="copy-code-btn" data-code="${encodeURIComponent(item.rawCode)}">Copy</button>
        </div>
        <pre><code class="language-${item.lang}">${item.code}</code></pre>
      </div>
    `;
    escaped = escaped.replace(`__CODE_BLOCK_${i}__`, blockHtml);
  }

  return escaped;
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        history = parsed;
        renderHistory();
      }
    }
  } catch {}
}

function saveHistory() {
  try {
    const capped = history.slice(-20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {}
}

function renderHistory() {
  messagesList.innerHTML = '';
  if (history.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  for (const item of history) {
    appendMessageBubble(item.role, item.content, false);
  }
  scrollToBottom();
}

function appendMessageBubble(role, content = '', isError = false) {
  const row = document.createElement('div');
  row.className = `message-row ${role}${isError ? ' error-row' : ''}`;

  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'avatar assistant-avatar';
    avatar.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    `;
    row.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'assistant') {
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
  }
  row.appendChild(bubble);

  messagesList.appendChild(row);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  chatViewport.scrollTop = chatViewport.scrollHeight;
}

function setStreamingUI(streaming) {
  isStreaming = streaming;
  if (streaming) {
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    promptInput.disabled = true;
  } else {
    stopBtn.classList.add('hidden');
    sendBtn.classList.remove('hidden');
    promptInput.disabled = false;
    promptInput.focus();
  }
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    statusBadge.className = 'status-badge';

    if (data.available) {
      statusBadge.classList.add('online');
      statusText.textContent = `${data.name || data.provider}: ${data.model}`;
      statusBadge.title = `Connected to ${data.name || data.provider} (${data.model})`;
    } else if (!data.configured) {
      statusBadge.classList.add('offline');
      statusText.textContent = `${data.name || data.provider}: Needs Key`;
      statusBadge.title = data.error || 'Server-side API key missing';
    } else {
      statusBadge.classList.add('offline');
      statusText.textContent = `${data.name || data.provider} Offline`;
      statusBadge.title = data.error || 'Provider currently unreachable';
    }
  } catch (err) {
    statusBadge.className = 'status-badge offline';
    statusText.textContent = 'Server Unreachable';
    statusBadge.title = err.message;
  }
}

async function handleSendMessage(promptText) {
  const text = (promptText || promptInput.value).trim();
  if (!text || isStreaming) {
    return;
  }

  emptyState.classList.add('hidden');
  appendMessageBubble('user', text);
  history.push({ role: 'user', content: text });
  saveHistory();

  promptInput.value = '';
  promptInput.style.height = 'auto';

  typingIndicator.classList.remove('hidden');
  scrollToBottom();

  setStreamingUI(true);
  abortController = new AbortController();
  const requestTimeoutId = setTimeout(() => {
    if (abortController) {
      abortController.abort(new Error('Request timed out after 45 seconds.'));
    }
  }, 45000);

  let assistantBubble = null;
  let accumulatedText = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: history,
        subject: subjectSelect.value
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      let errMessage = `Error ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.error) {
          errMessage = errJson.error;
        }
      } catch {}
      throw new Error(errMessage);
    }

    const data = await response.json();
    const reply = data.reply || '';

    typingIndicator.classList.add('hidden');

    if (reply) {
      appendMessageBubble('assistant', reply);
      history.push({ role: 'assistant', content: reply });
      saveHistory();
    } else {
      appendMessageBubble('assistant', 'The tutor provided an empty response. Please verify the active model settings.', true);
    }
  } catch (err) {
    typingIndicator.classList.add('hidden');
    if (err.name === 'AbortError') {
      const reason = err.message || '';
      if (reason.includes('timed out')) {
        appendMessageBubble('assistant', 'The request timed out after 45 seconds. Please try asking again.', true);
      } else {
        appendMessageBubble('assistant', 'Response stopped by student.', true);
      }
    } else {
      appendMessageBubble('assistant', `Tutor unavailable: ${err.message}`, true);
    }
  } finally {
    clearTimeout(requestTimeoutId);
    typingIndicator.classList.add('hidden');
    setStreamingUI(false);
    abortController = null;
  }
}

promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
});

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSendMessage();
});

stopBtn.addEventListener('click', () => {
  if (abortController) {
    abortController.abort();
  }
});

clearChatBtn.addEventListener('click', () => {
  if (confirm('Clear entire conversation history?')) {
    history = [];
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
  }
});

chipsContainer.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) {
    return;
  }
  const prompt = chip.getAttribute('data-prompt');
  const subject = chip.getAttribute('data-subject');
  if (subject && subjectSelect) {
    subjectSelect.value = subject;
  }
  if (prompt) {
    handleSendMessage(prompt);
  }
});

document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.copy-code-btn');
  if (!copyBtn) {
    return;
  }
  const code = decodeURIComponent(copyBtn.getAttribute('data-code') || '');
  if (code) {
    navigator.clipboard.writeText(code).then(() => {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    });
  }
});

function initLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  const loaderBar = document.getElementById('loaderBar');
  const loaderPercent = document.getElementById('loaderPercent');
  const loaderStatusText = document.getElementById('loaderStatusText');

  if (!loadingScreen) {
    return;
  }

  let isDone = false;

  const messages = [
    { at: 0, text: 'Initializing pedagogical neural core...' },
    { at: 24, text: 'Calibrating Socratic dialogue & first principles...' },
    { at: 54, text: 'Establishing private zero-tracking gateway...' },
    { at: 82, text: 'Preparing interactive derivation workspace...' },
    { at: 98, text: 'Academic Mentor Ready • Entering workspace' }
  ];

  function dismiss() {
    if (isDone) {
      return;
    }
    isDone = true;
    if (loaderBar) loaderBar.style.width = '100%';
    if (loaderPercent) loaderPercent.textContent = '100%';
    if (loaderStatusText) loaderStatusText.textContent = 'Welcome, Scholar • Workspace Ready';
    setTimeout(() => {
      loadingScreen.classList.add('loaded');
      setTimeout(() => {
        loadingScreen.remove();
      }, 700);
    }, 250);
  }

  loadingScreen.addEventListener('click', dismiss);

  const startTime = Date.now();
  const totalDuration = 1800;

  function update() {
    if (isDone) {
      return;
    }
    const elapsed = Date.now() - startTime;
    const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));

    if (loaderBar) {
      loaderBar.style.width = `${progress}%`;
    }
    if (loaderPercent) {
      loaderPercent.textContent = `${progress}%`;
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      if (progress >= messages[i].at) {
        if (loaderStatusText && loaderStatusText.textContent !== messages[i].text) {
          loaderStatusText.textContent = messages[i].text;
        }
        break;
      }
    }

    if (elapsed < totalDuration) {
      requestAnimationFrame(update);
    } else {
      dismiss();
    }
  }

  requestAnimationFrame(update);
}

initLoadingScreen();
loadHistory();
checkHealth();
setInterval(checkHealth, 60000);
