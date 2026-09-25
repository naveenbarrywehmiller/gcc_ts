const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config/env');
const { migrate } = require('./config/migrate');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Run migrations on startup
migrate();

const app = express();

// 🚧 Maintenance Mode Middleware
// Create a empty ".maintenance" file in the server directory to enable instantly without restarting
app.use((req, res, next) => {
  const fs = require('fs');
  if (fs.existsSync(path.join(__dirname, '..', '.maintenance'))) {
    if (req.path.startsWith('/api')) {
      return res.status(503).json({ error: 'System is currently down for maintenance (Database operations in progress).' });
    }
    return res.status(503).send(`
      <div style="text-align:center; padding:50px; font-family:system-ui, sans-serif;">
        <h1>🚧 System Under Maintenance 🚧</h1>
        <p>We are currently performing database backups or restoration.</p>
        <p>Please check back in a few minutes.</p>
      </div>
    `);
  }
  next();
});

// Security
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: { error: 'Too many requests, please try again later' },
  keyGenerator: (req) => {
    // Separate rate limits per user session, falling back to IP for unauthenticated routes
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }
    // Fallback to IP (trust proxy handles reverse proxies if configured)
    return req.ip || req.connection.remoteAddress;
  }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/auth-ms'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/divisions', require('./routes/divisions'));
app.use('/api/subdivisions', require('./routes/subdivisions'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/department-ownerships', require('./routes/department-ownerships'));
app.use('/api/supporting-categories', require('./routes/supporting-categories'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/timesheets', require('./routes/timesheets'));
app.use('/api/manager', require('./routes/manager'));
const powerBiBasePath = config.powerBiApiBasePath || '/api/powerbi';
app.use(powerBiBasePath, require('./routes/powerbi'));
if (powerBiBasePath !== '/api/powerbi') {
  app.use('/api/powerbi', require('./routes/powerbi'));
}
app.use('/api/reports', require('./routes/reports'));
app.use('/api/import', require('./routes/import'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/admin-ownership', require('./routes/admin-ownership'));
app.use('/api/sharepoint-sync', require('./routes/sharepoint-sync'));
// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend in production
if (config.nodeEnv === 'production') {
  const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
if (require.main === module) {
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║         ⏰ Timesheet Server Running               ║
║                                                   ║
║   Local:   http://localhost:${config.port}              ║
║   Network: http://0.0.0.0:${config.port}               ║
║   Mode:    ${config.nodeEnv.padEnd(37)}║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    `);
  });
}

module.exports = app;
