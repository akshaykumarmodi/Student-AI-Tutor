export const REGISTRY = {
  groq: {
    name: 'Groq',
    baseUrl: () => process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    model: () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    key: () => process.env.GROQ_API_KEY || '',
    headersFor: () => ({})
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: () => process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: () => process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free',
    key: () => process.env.OPENROUTER_API_KEY || '',
    headersFor: () => ({
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Student AI Tutor'
    })
  },
  huggingface: {
    name: 'Hugging Face',
    baseUrl: () => process.env.HF_BASE_URL || 'https://router.huggingface.co/v1',
    model: () => process.env.HF_MODEL || 'google/gemma-4-31B-it:novita',
    key: () => process.env.HF_TOKEN || '',
    headersFor: () => ({})
  },
  vllm: {
    name: 'vLLM (Self-Hosted)',
    baseUrl: () => process.env.VLLM_BASE_URL || 'http://localhost:8000/v1',
    model: () => process.env.VLLM_MODEL || 'mistralai/Mistral-Large-4-1T-A52B',
    key: () => process.env.VLLM_API_KEY || '',
    headersFor: () => ({})
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: () => process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',
    model: () => process.env.OLLAMA_MODEL || 'llama3.2',
    key: () => '',
    headersFor: () => ({})
  },
  demo: {
    name: 'Academic Demo Mode',
    baseUrl: () => 'http://localhost:3000/demo',
    model: () => 'socratic-tutor-v1',
    key: () => '',
    headersFor: () => ({})
  }
};

function generateDemoTokens(query) {
  const cleanQuery = query ? query.replace(/\n/g, ' ') : 'your topic';
  const fullText = `### Understanding the Problem

Let us examine **${cleanQuery}** by breaking it down into fundamental principles and working through the underlying concepts step by step.

---

### Step 1: Physical & Conceptual Intuition

Before diving into formal equations or algorithms, it is essential to build an intuitive mental model:

1. **State the Invariants:** Identify what quantities remain conserved or constant throughout the interaction.
2. **Examine Boundary Conditions:** What happens as key variables approach zero, and what happens as they scale towards infinity?
3. **Isolate Governing Laws:** Relate the system's observable behavior directly back to first principles.

---

### Step 2: Step-by-Step Derivation

Let us construct the formal mathematical relationship:

$$\\Delta S \\ge 0 \\quad \\text{and} \\quad \\sum_{i=1}^n x_i = C$$

Consider how each component transitions from step $k$ to step $k+1$:

- **Initial State ($t = 0$):** Establish our baseline assumptions and given constraints.
- **Transformation Phase ($t \\to t + \\Delta t$):** Apply the governing operator or algorithm transitions.
- **Equilibrium State:** Conclude with the simplified, canonical result.

\`\`\`javascript
function verifySolution(inputs) {
  const baseline = inputs.map(x => Math.pow(x, 2));
  return baseline.reduce((acc, curr) => acc + curr, 0);
}
\`\`\`

---

### Step 3: Synthesis & Reflection

> **Key Takeaway:** The power of this method lies not in memorizing the final formula, but in understanding how the constraints force this specific analytical outcome.

**Question for You:** How would the system behave if we inverted our initial assumption? Try calculating the first step yourself, and let me know what you find!`;

  const words = fullText.split(' ');
  const tokens = [];
  for (let i = 0; i < words.length; i++) {
    tokens.push(words[i] + (i < words.length - 1 ? ' ' : ''));
  }
  return tokens;
}

function getProviderKeyName(providerKey) {
  if (providerKey === 'huggingface') {
    return 'HF_TOKEN';
  }
  if (providerKey === 'groq') {
    return 'GROQ_API_KEY';
  }
  if (providerKey === 'openrouter') {
    return 'OPENROUTER_API_KEY';
  }
  if (providerKey === 'vllm') {
    return 'VLLM_API_KEY';
  }
  return `${providerKey.toUpperCase()}_API_KEY`;
}

function formatProviderError(status, errorBody, providerName, providerKey) {
  let message = `${providerName} error (${status})`;
  try {
    const parsed = JSON.parse(errorBody);
    if (parsed.error?.message) {
      message = parsed.error.message;
    } else if (parsed.error) {
      message = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
    } else if (parsed.message) {
      message = parsed.message;
    }
  } catch {}

  const keyName = getProviderKeyName(providerKey || providerName.toLowerCase());

  if (status === 401) {
    return new Error(`Authentication failed for ${providerName}. Please check your ${keyName} in .env.`);
  }
  if (status === 402 || /credit|quota|payment|billing|balance|exhausted|insufficient/i.test(message)) {
    return new Error(`${providerName} quota or credit limit exhausted: ${message}. Check your ${providerName} dashboard or switch providers in .env.`);
  }
  if (status === 404) {
    return new Error(`Model not found on ${providerName}. Verify the model ID in .env.`);
  }
  if (status === 429) {
    return new Error(`Rate limit or quota reached on ${providerName}: ${message}. Please wait a moment or check your account usage.`);
  }
  return new Error(message);
}

function buildHeaders(provider) {
  const headers = {
    'Content-Type': 'application/json',
    ...provider.headersFor()
  };
  const apiKey = provider.key();
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

export function getActiveProviderName() {
  const key = (process.env.PROVIDER || 'groq').toLowerCase();
  return REGISTRY[key] ? key : 'groq';
}

export function getProvider(name) {
  const key = (name || process.env.PROVIDER || 'groq').toLowerCase();
  return REGISTRY[key] || REGISTRY.groq;
}

export async function checkProviderHealth(providerName) {
  const activeName = providerName || getActiveProviderName();
  const provider = REGISTRY[activeName] || REGISTRY.groq;

  if (activeName === 'demo') {
    return {
      provider: 'demo',
      name: provider.name,
      model: provider.model(),
      configured: true,
      available: true
    };
  }

  const configured = activeName === 'ollama' || activeName === 'vllm' || Boolean(provider.key());

  if (!configured) {
    return {
      provider: activeName,
      name: provider.name,
      model: provider.model(),
      configured: false,
      available: false,
      error: `API key not configured in .env (${getProviderKeyName(activeName)} missing).`
    };
  }

  const endpoint = `${provider.baseUrl().replace(/\/$/, '')}/models`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: buildHeaders(provider),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      return {
        provider: activeName,
        name: provider.name,
        model: provider.model(),
        configured: true,
        available: true
      };
    }
    return {
      provider: activeName,
      name: provider.name,
      model: provider.model(),
      configured: true,
      available: false,
      error: `Provider returned status ${res.status}`
    };
  } catch (err) {
    return {
      provider: activeName,
      name: provider.name,
      model: provider.model(),
      configured: true,
      available: false,
      error: activeName === 'ollama'
        ? 'Ollama is offline or not installed. Run "ollama serve" to start.'
        : activeName === 'vllm'
          ? `vLLM container is unreachable at ${provider.baseUrl()}. Check if Docker container is running.`
          : `Cannot connect to ${provider.name}: ${err.message}`
    };
  }
}

export async function chat(providerName, messages, signal) {
  const activeKey = providerName || getActiveProviderName();
  const provider = getProvider(activeKey);

  if (activeKey === 'demo') {
    const question = messages[messages.length - 1]?.content || '';
    return generateDemoTokens(question).join('');
  }

  if (!provider.key() && activeKey !== 'ollama' && activeKey !== 'vllm') {
    throw new Error(`API token for ${provider.name} is missing. Please configure ${getProviderKeyName(activeKey)} in your .env file.`);
  }

  const modelName = provider.model();
  const isClassification = /prompt-guard|safeguard/i.test(modelName);

  let requestMessages = messages;
  if (isClassification) {
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    requestMessages = [{ role: 'user', content: lastUserMsg }];
  }

  const url = `${provider.baseUrl().replace(/\/$/, '')}/chat/completions`;
  const effectiveSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
    : AbortSignal.timeout(45000);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(provider),
      body: JSON.stringify({
        model: modelName,
        messages: requestMessages,
        stream: false
      }),
      signal: effectiveSignal
    });
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      throw new Error(`Request to ${provider.name} timed out or was cancelled.`);
    }
    throw new Error(`${provider.name} is unreachable. Check network or server status.`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw formatProviderError(response.status, errorText, provider.name, activeKey);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '';
  if (isClassification) {
    const num = parseFloat(rawContent);
    const scoreText = Number.isFinite(num) ? num.toFixed(6) : rawContent;
    const isRisky = Number.isFinite(num) && num > 0.5;
    const riskLabel = isRisky ? 'High (Risk of Prompt Injection / Malicious Prompt)' : 'Low (Safe Prompt)';
    return `### Meta Prompt Guard 2 (22M) Analysis\n\n- **Model:** \`${modelName}\`\n- **Injection Risk Score:** \`${scoreText}\`\n- **Safety Assessment:** **${riskLabel}**\n\n*(Note: \`${modelName}\` is a 22-million parameter security classifier from Meta designed to detect prompt attacks, rather than generate conversational tutor lessons.)*`;
  }
  return rawContent;
}

export async function* chatStream(providerName, messages, signal) {
  const provider = getProvider(providerName);
  const activeKey = providerName || getActiveProviderName();
  const modelName = provider.model();
  const isClassification = /prompt-guard|safeguard/i.test(modelName);

  if (isClassification) {
    const fullResult = await chat(providerName, messages, signal);
    const tokens = fullResult.split(' ');
    for (let i = 0; i < tokens.length; i++) {
      if (signal?.aborted) {
        return;
      }
      yield tokens[i] + (i < tokens.length - 1 ? ' ' : '');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return;
  }

  if (activeKey === 'demo') {
    const question = messages[messages.length - 1]?.content || '';
    const tokens = generateDemoTokens(question);
    for (const token of tokens) {
      if (signal?.aborted) {
        return;
      }
      yield token;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return;
  }

  if (!provider.key() && activeKey !== 'ollama' && activeKey !== 'vllm') {
    throw new Error(`API token for ${provider.name} is missing. Please configure ${getProviderKeyName(activeKey)} in your .env file.`);
  }

  const url = `${provider.baseUrl().replace(/\/$/, '')}/chat/completions`;
  const effectiveSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
    : AbortSignal.timeout(45000);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(provider),
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true
      }),
      signal: effectiveSignal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return;
    }
    if (err.name === 'TimeoutError') {
      throw new Error(`${provider.name} inference timed out after 45 seconds.`);
    }
    throw new Error(`${provider.name} is unreachable. Ensure the service is running.`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw formatProviderError(response.status, errorText, provider.name, activeKey);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) {
          continue;
        }
        if (trimmed === 'data: [DONE]') {
          return;
        }
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            continue;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
