# Student AI Tutor 🎓

A private, beginner-friendly AI academic tutor designed for university students. It provides structured explanations, intuitive real-world examples, and multi-turn conversational reasoning using hosted open-weight AI models.

---

## Architecture Overview

- **Frontend**: Framework-free vanilla HTML5, modern CSS, and native ES modules in `public/`. No React, no build steps, and zero external analytics.
- **Backend**: Lightweight Node.js 18+ Express server (`server.js`) using ES modules.
- **Hosted Provider Layer**: Dynamic provider registry supporting OpenAI-compatible chat endpoints (**Groq**, **OpenRouter**, **Hugging Face Inference Providers**).
- **Zero Browser Tools**: Pure question-answer academic tutoring without web browsing, search engines, or external scraping tools.
- **No Silent Fallback**: If a provider fails or quota is exhausted, explicit actionable errors are displayed—it will **never** silently fall back to Ollama.
- **Security**: All API keys live exclusively on the server in `.env`. Client requests pass through sliding-window rate limiting, input sanitization, and output scrubbing.

---

## Supported Hosted Providers (Free Tier Available)

Switch providers anytime in `.env` (`PROVIDER=...`) without touching source code:

| Provider | Recommended Free-Tier Model | Where to Get Free API Key |
| :--- | :--- | :--- |
| **Groq** *(Default)* | `openai/gpt-oss-120b` | Free at [console.groq.com/keys](https://console.groq.com/keys) (No credit card needed) |
| **OpenRouter** | `meta-llama/llama-3.2-3b-instruct:free` | Free at [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Hugging Face** | `google/gemma-4-31B-it:novita` | Free tokens at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| **Academic Demo** | `socratic-tutor-v1` | Built-in (requires zero API keys, zero credits) |

---

## Quick Start (Run Locally)

### 1. Install Dependencies
```bash
cd student-ai-site
npm install
```

### 2. Configure Environment
Copy the example configuration:
```bash
cp .env.example .env
```

Edit `.env` and set your preferred provider.

#### Option A: Groq (Recommended — Ultra-fast & Free)
```env
PORT=3000
PROVIDER=groq
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

#### Option B: OpenRouter (Free Models)
```env
PORT=3000
PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
```

#### Option C: Academic Demo Mode (Instant Zero-Key Testing)
```env
PORT=3000
PROVIDER=demo
```

### 3. Launch the Server
```bash
npm start
```
Open **`http://localhost:3000`** in any web browser.

---

## API Endpoints

- **`POST /api/chat`**: Secure question-answer endpoint. Accepts `{ messages, subject }` or `{ question }`. Returns `{ reply }`.
- **`GET /api/health`**: Provider connectivity and configuration status JSON.
- **`GET /api/providers`**: List of all registered inference providers and active selection.
