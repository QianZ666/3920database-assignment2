const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const { requireLogin } = require('../middleware/auth');

router.get('/rooms', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.user_id;

    const [rooms] = await db.query(
      `
      SELECT r.room_id, r.name, r.start_datetime
      FROM room r
      JOIN room_user ru ON r.room_id = ru.room_id
      WHERE ru.user_id = ?
      ORDER BY r.start_datetime DESC
      `,
      [userId]
    );

    res.render('rooms', {
      rooms,
      currentUser: req.session.user
    });
  } catch (error) {
    console.error('Rooms page error:', error);
    res.status(500).send('Failed to load rooms.');
  }
});

module.exports = router;