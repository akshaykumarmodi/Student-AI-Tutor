export function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs) || Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
  const maxRequests = Number(options.maxRequests) || Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 30;
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, windowMs).unref();

  return function rateLimit(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const sessionId = req.headers['x-session-id'] || '';
    const key = sessionId ? `${ip}:${sessionId}` : String(ip);

    const now = Date.now();
    let record = hits.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      hits.set(key, record);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before asking another question.',
        retryAfter: retryAfterSeconds
      });
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    next();
  };
}
