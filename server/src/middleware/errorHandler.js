// server/src/middleware/errorHandler.js

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error('[candle-rider-api] unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal server error' });
}
