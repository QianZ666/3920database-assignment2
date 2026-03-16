const express = require('express');
const router = express.Router();

router.get('/rooms', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  res.send(`Welcome ${req.session.user.username}. This is the rooms page.`);
});

module.exports = router;