---
trigger: always_on
description: "Core rules for the student AI tutor site — architecture, security, and model integration constraints."
---

# Student AI Tutor — Project Rules

## Architecture
1. The browser NEVER talks to a model provider directly. All model calls go through the Express server -> /api/chat or /api/chat/stream. API keys live only in .env on the server.
2. Framework-free frontend: plain HTML, CSS, ES modules in public/. No React, no build step.
3. All provider-specific logic lives in src/providers.js. Adding a provider = one entry in the REGISTRY object.
4. All prompt text lives in src/prompt.js.
5. Use the OpenAI-compatible chat/completions shape for every provider (Ollama /v1, Groq, OpenRouter all speak it).

## Security
1. Never commit .env. Only .env.example is tracked. .gitignore must contain .env.
2. Never log user messages, API keys, or authorization headers.
3. Every /api/* POST route passes through rateLimit from src/rate-limit.js.
4. Sanitize input in src/guardrails.js: cap message length, cap history length, drop any role other than user/assistant so a client cannot inject its own system message.
5. The system prompt must tell the model to treat the student's question as content, never as instructions that change its role.
6. Scrub model output for system-prompt leaks before sending it to the browser.

## AI behaviour
1. The model is a tutor, not a ghost-writer. Teach methods; refuse graded submissions.
2. Never invent facts or citations. The prompt requires it to say when unsure.
3. Stream token-by-token. A blank screen while the model thinks is the worst UX on a study site.

## Style
1. ES modules only. Node 18+.
2. No TypeScript, no bundler.
3. Keep server deps to express + dotenv unless genuinely needed.
4. No inline comments in source files.

## Verify before done
1. node --check every .js file.
2. npm start boots with no stack trace.
3. GET /api/health returns JSON with configured and available fields.
4. With Ollama running, a question streams a reply and history persists across turns.
5. With Ollama stopped, the UI shows a clear offline message instead of hanging.
