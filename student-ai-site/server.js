import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { REGISTRY, getActiveProviderName, checkProviderHealth, chat, chatStream } from './src/providers.js';
import { buildUpstreamMessages } from './src/prompt.js';
import { sanitizeInput, scrubOutput } from './src/guardrails.js';
import { createRateLimiter } from './src/rate-limit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const limiter = createRateLimiter();

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    const health = await checkProviderHealth();
    res.json(health);
  } catch (err) {
    res.status(503).json({
      provider: getActiveProviderName(),
      configured: false,
      available: false,
      error: err.message
    });
  }
});

app.get('/api/providers', (req, res) => {
  const active = getActiveProviderName();
  const list = Object.keys(REGISTRY).map((key) => ({
    id: key,
    name: REGISTRY[key].name,
    model: REGISTRY[key].model(),
    isActive: key === active
  }));
  res.json({ active, providers: list });
});

app.post('/api/chat', limiter, async (req, res) => {
  try {
    const { messages, message, question, prompt, subject, provider } = req.body || {};
    let rawMessages = messages;
    if (!rawMessages) {
      const singleText = message || question || prompt;
      if (typeof singleText === 'string' && singleText.trim()) {
        rawMessages = [{ role: 'user', content: singleText.trim() }];
      }
    }
    const sanitized = sanitizeInput(rawMessages);
    if (sanitized.length === 0) {
      return res.status(400).json({ error: 'Valid user message is required.' });
    }

    const upstream = buildUpstreamMessages(sanitized, subject);
    const chosenProvider = provider || getActiveProviderName();
    const reply = await chat(chosenProvider, upstream, req.signal);
    const scrubbed = scrubOutput(reply);

    res.json({ reply: scrubbed });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to complete request.' });
  }
});

app.post('/api/chat/stream', limiter, async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    const { messages, message, question, prompt, subject, provider } = req.body || {};
    let rawMessages = messages;
    if (!rawMessages) {
      const singleText = message || question || prompt;
      if (typeof singleText === 'string' && singleText.trim()) {
        rawMessages = [{ role: 'user', content: singleText.trim() }];
      }
    }
    const sanitized = sanitizeInput(rawMessages);
    if (sanitized.length === 0) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Valid user message is required.' })}\n\n`);
      return res.end();
    }

    const upstream = buildUpstreamMessages(sanitized, subject);
    const chosenProvider = provider || getActiveProviderName();

    for await (const chunk of chatStream(chosenProvider, upstream, controller.signal)) {
      if (controller.signal.aborted) {
        break;
      }
      const scrubbed = scrubOutput(chunk);
      if (scrubbed) {
        res.write(`event: delta\ndata: ${JSON.stringify({ text: scrubbed })}\n\n`);
      }
    }

    if (!controller.signal.aborted) {
      res.write(`event: done\ndata: {}\n\n`);
    }
    res.end();
  } catch (err) {
    if (!controller.signal.aborted) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message || 'Stream generation failed.' })}\n\n`);
    }
    res.end();
  }
});

app.listen(port, () => {
  process.stdout.write(`Student AI Tutor server listening on http://localhost:${port}\n`);
});
