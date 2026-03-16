const express = require('express');
const router = express.Router();

router.get('/login', (req, res) => {
  res.send('Login page');
});

router.get('/signup', (req, res) => {
  res.send('Signup page');
});

module.exports = router;