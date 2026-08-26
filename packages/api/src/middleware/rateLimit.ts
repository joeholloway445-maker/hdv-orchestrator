import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' }
});

export const executionLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Execution rate limit exceeded.' }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts.' }
});
