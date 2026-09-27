const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Only system admins can access these routes
router.use(authenticate);
router.use(authorize('system admin'));

const maintenanceFile = path.join(__dirname, '..', '..', '.maintenance');

// --- Maintenance Mode ---
router.get('/maintenance', (req, res) => {
  const enabled = fs.existsSync(maintenanceFile);
  res.json({ enabled });
});

router.post('/maintenance', (req, res) => {
  const { enabled } = req.body;
  if (enabled) {
    if (!fs.existsSync(maintenanceFile)) {
      fs.writeFileSync(maintenanceFile, '');
    }
  } else {
    if (fs.existsSync(maintenanceFile)) {
      fs.unlinkSync(maintenanceFile);
    }
  }
  res.json({ enabled: !!enabled });
});

// --- Backup ---
router.post('/backup', (req, res) => {
  exec('npm run backup', { cwd: path.join(__dirname, '..', '..') }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup error: ${error}`);
      return res.status(500).json({ error: 'Backup failed', details: stderr });
    }
    res.json({ success: true, message: stdout });
  });
});

// --- Restore ---
router.post('/restore', (req, res) => {
  exec('npm run restore', { cwd: path.join(__dirname, '..', '..') }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Restore error: ${error}`);
      return res.status(500).json({ error: 'Restore failed', details: stderr });
    }
    res.json({ success: true, message: stdout });
  });
});

// --- Token Generation ---
router.post('/tokens', (req, res) => {
  const { expiresIn, role } = req.body; // e.g. '1h', '30d', or 'never'
  
  const payload = { 
    userId: req.user.id, 
    role: role || req.user.role 
  };
  
  let token;
  if (expiresIn === 'never') {
    // No expiration
    token = jwt.sign(payload, config.jwtSecret);
  } else {
    token = jwt.sign(payload, config.jwtSecret, { expiresIn: expiresIn || '30d' });
  }
  
  res.json({ token });
});

module.exports = router;
