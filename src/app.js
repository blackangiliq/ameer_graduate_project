// Express application: security middleware -> routes -> static UI.
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const { authenticate, requirePasswordChanged } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// Security headers: CSP (no inline scripts), clickjacking protection, HSTS, no-sniff...
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'style-src-attr': ["'unsafe-inline'"], // style="" attributes only; scripts stay strictly 'self'
      'script-src-attr': ["'none'"],         // no onclick="" handlers at all
      'img-src': ["'self'", 'data:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': config.isProduction ? [] : null,
    },
  },
  hsts: config.isProduction,
}));

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

// Rate limiting on authentication endpoints (online brute-force / credential stuffing).
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.authMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة جداً من هذا العنوان، حاول بعد قليل' },
});
const apiLimiter = rateLimit({ windowMs: config.rateLimit.windowMs, limit: config.rateLimit.apiMax, standardHeaders: 'draft-7', legacyHeaders: false });

// API responses must never be cached by the browser or a proxy.
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, apiLimiter);

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/mfa/verify', authLimiter);
app.use('/api/auth', require('./routes/auth'));

// Everything below requires a valid identity AND a non-temporary password.
const protectedApi = [authenticate, requirePasswordChanged];
app.use('/api/mfa', protectedApi, require('./routes/mfa'));
app.use('/api/users', protectedApi, require('./routes/users'));
app.use('/api/roles', protectedApi, require('./routes/roles'));
app.use('/api/audit', protectedApi, require('./routes/audit'));
app.use('/api/sessions', protectedApi, require('./routes/sessions'));
app.use('/api/dashboard', protectedApi, require('./routes/dashboard'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

app.use(express.static(path.join(config.root, 'public'), { extensions: ['html'] }));
app.get('/', (req, res) => res.redirect('/login'));

// Central error handler: log details on the server, never leak stack traces to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'صيغة JSON غير صالحة' });
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ داخلي في الخادم' });
});

module.exports = app;
