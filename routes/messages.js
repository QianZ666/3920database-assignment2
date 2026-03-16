const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const { requireLogin } = require('../middleware/auth');

router.post('/rooms/:roomId/messages', requireLogin, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const userId = req.session.user.user_id;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.redirect(`/rooms/${roomId}`);
    }

    // Make sure this user belongs to the room
    const [roomUserRows] = await db.query(
      `
      SELECT room_user_id
      FROM room_user
      WHERE room_id = ? AND user_id = ?
      `,
      [roomId, userId]
    );

    if (roomUserRows.length === 0) {
      return res.status(400).send("You are not allowed to send messages in this room.");
    }

    const roomUserId = roomUserRows[0].room_user_id;

    await db.query(
      `
      INSERT INTO message (room_user_id, sent_datetime, text)
      VALUES (?, NOW(), ?)
      `,
      [roomUserId, text.trim()]
    );

    res.redirect(`/rooms/${roomId}`);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).send("Failed to send message.");
  }
});

module.exports = router;