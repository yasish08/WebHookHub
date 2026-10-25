const windows = new Map();
let requestsSinceSweep = 0;

export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  now = () => Date.now(),
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || "unknown",
} = {}) {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new TypeError("windowMs must be a positive integer");
  if (!Number.isSafeInteger(max) || max < 1) throw new TypeError("max must be a positive integer");

  return function rateLimit(req, res, next) {
    const key = String(keyGenerator(req));
    const timestamp = now();
    requestsSinceSweep += 1;
    if (requestsSinceSweep >= 256) {
      requestsSinceSweep = 0;
      for (const [storedKey, storedEntry] of windows) {
        if (timestamp >= storedEntry.resetAt || timestamp < storedEntry.startedAt) windows.delete(storedKey);
      }
    }
    let entry = windows.get(key);
    if (!entry || timestamp >= entry.resetAt || timestamp < entry.startedAt) {
      entry = { count: 0, startedAt: timestamp, resetAt: timestamp + windowMs };
      windows.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.set?.("RateLimit-Limit", String(max));
    res.set?.("RateLimit-Remaining", String(remaining));
    res.set?.("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.set?.("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000))));
      return res.status(429).json({
        error: "rate_limit_exceeded",
        message: "Too many authentication attempts. Wait before trying again.",
      });
    }
    return next();
  };
}

// Exported only to keep unit tests isolated from shared process state.
export function resetRateLimitStateForTests() {
  windows.clear();
  requestsSinceSweep = 0;
}
