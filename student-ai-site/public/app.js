import { renderUniversalResponse } from './renderer.js';

const SESSION_STORAGE_KEY = 'student_ai_session_chat';
const SESSION_ID_KEY = 'student_ai_session_id';

let currentSessionId = '';
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
const newChatBtn = document.getElementById('newChatBtn');
const infoBtn = document.getElementById('infoBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const infoModal = document.getElementById('infoModal');
const modeTabs = document.querySelectorAll('.mode-tab');
const cursorGlow = document.getElementById('cursorGlow');

const MODE_PLACEHOLDERS = {
  socratic: 'Type your prompt here...',
  derivation: 'Type your prompt here...',
  principles: 'Type your prompt here...'
};

let activeMode = 'socratic';

function generateSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function initSession(forceNew = false) {
  try {
    localStorage.removeItem('student_ai_tutor_v1');
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}

  if (forceNew) {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_ID_KEY);
    } catch {}
  }

  let storedId = null;
  try {
    storedId = sessionStorage.getItem(SESSION_ID_KEY);
  } catch {}

  if (!storedId || forceNew) {
    currentSessionId = generateSessionId();
    try {
      sessionStorage.setItem(SESSION_ID_KEY, currentSessionId);
    } catch {}
    history = [];
    renderHistory();
    return;
  }

  currentSessionId = storedId;
  try {
    const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        history = parsed;
        renderHistory();
        return;
      }
    }
  } catch {}

  history = [];
  renderHistory();
}

function saveHistory() {
  try {
    const capped = history.slice(-20);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(capped));
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
    bubble.innerHTML = renderUniversalResponse(content, { isStreaming: false });
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
  let renderRaf = null;

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: history,
        subject: subjectSelect ? subjectSelect.value : 'general',
        sessionId: currentSessionId
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      let errMessage = `Error ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.error) {
          errMessage = errJson.error;
        } else if (errJson.message) {
          errMessage = errJson.message;
        }
      } catch {}
      throw new Error(errMessage);
    }

    typingIndicator.classList.add('hidden');
    assistantBubble = appendMessageBubble('assistant', '', false);

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('data:')) {
          const jsonStr = line.slice(5).trim();
          if (jsonStr) {
            try {
              const data = JSON.parse(jsonStr);
              if (data.text) {
                accumulatedText += data.text;
                if (!renderRaf) {
                  renderRaf = requestAnimationFrame(() => {
                    renderRaf = null;
                    if (assistantBubble) {
                      assistantBubble.innerHTML = renderUniversalResponse(accumulatedText, { isStreaming: true });
                      scrollToBottom();
                    }
                  });
                }
              } else if (data.message && !accumulatedText) {
                throw new Error(data.message);
              }
            } catch (e) {
              if (e.message && !accumulatedText) {
                throw e;
              }
            }
          }
        }
      }
    }

    if (renderRaf) {
      cancelAnimationFrame(renderRaf);
      renderRaf = null;
    }

    if (assistantBubble) {
      if (accumulatedText.trim()) {
        assistantBubble.innerHTML = renderUniversalResponse(accumulatedText, { isStreaming: false });
        history.push({ role: 'assistant', content: accumulatedText });
        saveHistory();
      } else {
        assistantBubble.innerHTML = renderUniversalResponse('The model provided an empty response.', { isStreaming: false });
      }
    }
  } catch (err) {
    if (renderRaf) {
      cancelAnimationFrame(renderRaf);
      renderRaf = null;
    }
    typingIndicator.classList.add('hidden');
    if (err.name === 'AbortError') {
      if (!accumulatedText && assistantBubble) {
        assistantBubble.parentElement?.remove();
      } else if (assistantBubble) {
        assistantBubble.innerHTML = renderUniversalResponse(accumulatedText, { isStreaming: false });
      }
    } else {
      if (assistantBubble) {
        assistantBubble.parentElement?.remove();
      }
      appendMessageBubble('assistant', `Tutor unavailable: ${err.message}`, true);
    }
  } finally {
    clearTimeout(requestTimeoutId);
    typingIndicator.classList.add('hidden');
    setStreamingUI(false);
    abortController = null;
    scrollToBottom();
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
  if (confirm('Clear current session history?')) {
    initSession(true);
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

modeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    modeTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeMode = tab.dataset.mode || 'socratic';
    if (MODE_PLACEHOLDERS[activeMode]) {
      promptInput.placeholder = MODE_PLACEHOLDERS[activeMode];
    }
    promptInput.focus();
  });
});

if (newChatBtn) {
  newChatBtn.addEventListener('click', () => {
    if (isStreaming && abortController) {
      abortController.abort();
    }
    initSession(true);
    promptInput.value = '';
    promptInput.style.height = 'auto';
    promptInput.focus();
  });
}

if (infoBtn && infoModal) {
  infoBtn.addEventListener('click', () => {
    infoModal.classList.remove('hidden');
  });
}

if (closeModalBtn && infoModal) {
  closeModalBtn.addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });
}

if (infoModal) {
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) {
      infoModal.classList.add('hidden');
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !infoModal.classList.contains('hidden')) {
      infoModal.classList.add('hidden');
    }
  });
}

if (cursorGlow) {
  window.addEventListener('pointermove', (e) => {
    cursorGlow.style.left = `${e.clientX}px`;
    cursorGlow.style.top = `${e.clientY}px`;
    cursorGlow.style.opacity = '1';
  }, { passive: true });
}

document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.copy-code-btn');
  if (!copyBtn) {
    return;
  }
  const code = decodeURIComponent(copyBtn.getAttribute('data-code') || '');
  if (code) {
    navigator.clipboard.writeText(code).then(() => {
      const textSpan = copyBtn.querySelector('.copy-btn-text');
      const target = textSpan || copyBtn;
      const originalText = target.textContent;
      target.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        target.textContent = originalText;
        copyBtn.classList.remove('copied');
      }, 2000);
    });
  }
});

function initLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  const loaderBar = document.getElementById('loaderBar');
  const loaderPercent = document.getElementById('loaderPercent');
  const loaderStatusText = document.getElementById('loaderStatusText');
  const loaderTelemetry = document.getElementById('loaderTelemetry');

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

  const telemetryStages = [
    { at: 0, html: '<span class="tele-item">&gt; SYNAPSE_INIT [OK]</span><span class="tele-item">&gt; SOCRATIC_GATEWAY [STANDBY]</span>' },
    { at: 22, html: '<span class="tele-item">&gt; NEURAL_LATTICE [MAPPING 4096 NODES]</span><span class="tele-item">&gt; PEDAGOGICAL_CORE [ENGAGED]</span>' },
    { at: 48, html: '<span class="tele-item">&gt; ZERO_RETENTION_TUNNEL [ACTIVE]</span><span class="tele-item">&gt; AES_GCM_ENCRYPTION [LOCKED]</span>' },
    { at: 74, html: '<span class="tele-item">&gt; LATENCY [8ms] // BUFFER [64KB]</span><span class="tele-item">&gt; DERIVATION_ENGINE [ONLINE]</span>' },
    { at: 94, html: '<span class="tele-item">&gt; ALL_SYSTEMS_OPTIMAL</span><span class="tele-item">&gt; ENTERING_WORKSPACE [100%]</span>' }
  ];

  function dismiss() {
    if (isDone) {
      return;
    }
    isDone = true;
    if (loaderBar) loaderBar.style.width = '100%';
    if (loaderPercent) loaderPercent.textContent = '100%';
    if (loaderStatusText) loaderStatusText.textContent = 'Welcome, Scholar • Workspace Ready';
    if (loaderTelemetry) {
      loaderTelemetry.innerHTML = '<span class="tele-item">&gt; HANDSHAKE COMPLETE</span><span class="tele-item">&gt; SOCRATIC MENTOR READY</span>';
    }
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

    if (loaderTelemetry) {
      for (let i = telemetryStages.length - 1; i >= 0; i--) {
        if (progress >= telemetryStages[i].at) {
          if (loaderTelemetry.dataset.stage !== String(i)) {
            loaderTelemetry.dataset.stage = String(i);
            loaderTelemetry.innerHTML = telemetryStages[i].html;
          }
          break;
        }
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
initSession();
checkHealth();
setInterval(checkHealth, 60000);
