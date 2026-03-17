const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const { requireLogin } = require('../middleware/auth');

router.get('/messages/:messageId/react', requireLogin, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const roomId = req.query.roomId;

    const [emojis] = await db.query(`
      SELECT emoji_id, name
      FROM emoji
      ORDER BY emoji_id ASC
    `);

    res.render('react', {
      messageId,
      roomId,
      emojis
    });
  } catch (error) {
    console.error('Load reaction page error:', error);
    res.status(500).send('Failed to load reaction page.');
  }
});

router.post('/rooms/:roomId/messages', requireLogin, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const userId = req.session.user.user_id;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.redirect(`/rooms/${roomId}`);
    }

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

    const [result] = await db.query(
      `
      INSERT INTO message (room_user_id, sent_datetime, text)
      VALUES (?, NOW(), ?)
      `,
      [roomUserId, text.trim()]
    );

    const newMessageId = result.insertId;

    // mark your own new message as read for yourself
    await db.query(
      `
      UPDATE room_user
      SET last_read_message_id = ?
      WHERE room_id = ? AND user_id = ?
      `,
      [newMessageId, roomId, userId]
    );

    res.redirect(`/rooms/${roomId}`);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).send("Failed to send message.");
  }
});

router.post('/messages/:messageId/react', requireLogin, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.session.user.user_id;
    const emojiId = req.body.emoji_id;
    const roomId = req.body.roomId;

    const [existing] = await db.query(
      `
      SELECT *
      FROM message_emojis
      WHERE message_id = ? AND emoji_id = ? AND user_id = ?
      `,
      [messageId, emojiId, userId]
    );

    if (existing.length === 0) {
      await db.query(
        `
        INSERT INTO message_emojis (message_id, emoji_id, user_id)
        VALUES (?, ?, ?)
        `,
        [messageId, emojiId, userId]
      );
    }

    res.redirect(`/rooms/${roomId}`);
  } catch (error) {
    console.error('Reaction error:', error);
    res.status(500).send('Failed to react');
  }
});
module.exports = router;