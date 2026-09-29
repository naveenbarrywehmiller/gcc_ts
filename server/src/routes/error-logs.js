const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { readSystemErrors } = require('../utils/systemLog');
router.get('/', authenticate, authorize('system admin'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(readSystemErrors());
});
module.exports = router;
