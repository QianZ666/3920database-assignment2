const express = require('express');
const router = express.Router();

router.get('/rooms', (req, res) => {
  res.send('Rooms page');
});

module.exports = router;