const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');

router.get('/rooms', requireLogin, (req, res) => {
  res.send(`Welcome ${req.session.user.username}. This is the rooms page.`);
});

module.exports = router;