const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { permit } = require('../middleware/permissions');
const { readSystemErrors } = require('../utils/systemLog');
router.get('/', authenticate, permit('system'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(readSystemErrors());
});
module.exports = router;
