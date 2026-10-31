---
name: student-ai-tutor
description: "Rebuild, extend, or test the Student AI Tutor site following architecture, security, and streaming constraints."
---

# Student AI Tutor Skill

Follow all project rules in `.agents/rules/student-ai-site.md`:
- Browser NEVER touches model APIs directly. All traffic routes through Express server endpoints (`/api/chat`, `/api/chat/stream`).
- Framework-free frontend in `public/` (ES modules, vanilla CSS, semantic HTML).
- One unified provider interface in `src/providers.js` supporting Ollama, Groq, and OpenRouter via OpenAI-compatible endpoints.
- Robust guardrails in `src/guardrails.js` for input sanitization (dropping unauthorized roles, length caps) and output scrubbing (preventing prompt leaks).
- In-memory rate limiting in `src/rate-limit.js`.
- No inline comments in JavaScript source files.
