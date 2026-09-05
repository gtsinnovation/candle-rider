// server/src/middleware/rateLimit.js
//
// In-memory per-IP rate limiter for the single-process Node server.
// Good enough for one box; swap for a Redis-backed store if horizontal
// scaling is ever added. Buckets are swept lazily on each request.

export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return function rateLimitMiddleware(req, res, next) {
    const ip = (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown').replace(/^::ffff:/, '');
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(ip, arr);
    if (arr.length > max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: 'too many requests' });
    }
    next();
  };
}
