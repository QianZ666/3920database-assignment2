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

router.get('/rooms/:roomId', requireLogin, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const userId = req.session.user.user_id;

    // Authorization check
    const [rows] = await db.query(
      `SELECT * FROM room_user WHERE room_id = ? AND user_id = ?`,
      [roomId, userId]
    );

    if (rows.length === 0) {
      return res.status(400).send("You are not allowed to access this room.");
    }

    // Load messages
    const [messages] = await db.query(
      `
      SELECT m.message_id, m.text, m.sent_datetime, u.username
      FROM message m
      JOIN room_user ru ON m.room_user_id = ru.room_user_id
      JOIN user u ON ru.user_id = u.user_id
      WHERE ru.room_id = ?
      ORDER BY m.sent_datetime ASC
      `,
      [roomId]
    );

    // Load current room members
    const [members] = await db.query(
      `
      SELECT u.user_id, u.username, u.email
      FROM room_user ru
      JOIN user u ON ru.user_id = u.user_id
      WHERE ru.room_id = ?
      ORDER BY u.username ASC
      `,
      [roomId]
    );

    res.render("room", {
      roomId,
      messages,
      members,
      currentUser: req.session.user
    });

  } catch (error) {
    console.error("Room error:", error);
    res.status(500).send("Server error");
  }
});

module.exports = router;