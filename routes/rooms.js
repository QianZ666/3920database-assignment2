const express = require('express');
const router = express.Router();
const db = require('../db/mysql');
const { requireLogin } = require('../middleware/auth');

function formatMessageTime(datetime) {
  const date = new Date(datetime);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

router.get('/rooms', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.user_id;

    const [rooms] = await db.query(
    `
    SELECT 
      r.room_id,
      r.name,
      MAX(m.sent_datetime) AS last_message_time,

      (
        SELECT COUNT(*)
        FROM message m2
        JOIN room_user sender_ru ON m2.room_user_id = sender_ru.room_user_id
        JOIN room_user current_ru ON current_ru.room_id = sender_ru.room_id
        WHERE current_ru.user_id = ?
          AND current_ru.room_id = r.room_id
          AND m2.message_id > COALESCE(current_ru.last_read_message_id, 0)
          AND sender_ru.user_id != current_ru.user_id
      ) AS unread_count

    FROM room r
    JOIN room_user ru ON r.room_id = ru.room_id
    LEFT JOIN room_user ru2 ON r.room_id = ru2.room_id
    LEFT JOIN message m ON ru2.room_user_id = m.room_user_id
    WHERE ru.user_id = ?
    GROUP BY r.room_id, r.name
    ORDER BY last_message_time DESC, r.start_datetime DESC
    `,
    [userId, userId]
  );
    function formatRoomDate(date) {
      if (!date) return 'No messages yet';

      const now = new Date();
      const d = new Date(date);

      const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      const diffDays = Math.floor((nowDay - msgDay) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'today';
      if (diffDays === 1) return 'yesterday';
      if (diffDays === 2) return '2 days ago';

      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }

    rooms.forEach(room => {
      room.displayLastMessageTime = formatRoomDate(room.last_message_time);
    });

    res.render('rooms', {
      rooms,
      currentUser: req.session.user,
      groupCount: rooms.length
    });
  } catch (error) {
    console.error('Rooms page error:', error);
    res.status(500).send('Failed to load rooms.');
  }
});

router.get('/rooms/new', requireLogin, (req, res) => {
  res.render('newRoom');
});

router.post('/rooms/new', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.user_id;
    const { roomName } = req.body;

    if (!roomName || !roomName.trim()) {
      return res.redirect('/rooms');
    }

    // Create room
    const [result] = await db.query(
      `
      INSERT INTO room (name, start_datetime)
      VALUES (?, NOW())
      `,
      [roomName.trim()]
    );

    const roomId = result.insertId;

    // Add creator to room
    await db.query(
      `
      INSERT INTO room_user (user_id, room_id)
      VALUES (?, ?)
      `,
      [userId, roomId]
    );

    res.redirect(`/rooms/${roomId}`);

  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).send("Failed to create room");
  }
});

router.get('/rooms/:roomId', requireLogin, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const userId = req.session.user.user_id;

    // 1. check membership and get OLD last_read_message_id
    const [rows] = await db.query(
      `SELECT * FROM room_user WHERE room_id = ? AND user_id = ?`,
      [roomId, userId]
    );

    if (rows.length === 0) {
      return res.status(400).send("You are not allowed to access this room.");
    }

    const lastReadMessageId = rows[0].last_read_message_id || 0;

    // 2. load messages
    const [messages] = await db.query(
      `
      SELECT 
        m.message_id,
        m.text,
        m.sent_datetime,
        u.user_id,
        u.username
      FROM message m
      JOIN room_user ru ON m.room_user_id = ru.room_user_id
      JOIN user u ON ru.user_id = u.user_id
      WHERE ru.room_id = ?
      ORDER BY m.message_id ASC
      `,
      [roomId]
    );

    // 3. decorate messages
    for (let msg of messages) {
      const [reactionRows] = await db.query(
        `
        SELECT e.emoji_id, e.name, COUNT(*) AS count
        FROM message_emojis me
        JOIN emoji e ON me.emoji_id = e.emoji_id
        WHERE me.message_id = ?
        GROUP BY e.emoji_id, e.name
        ORDER BY e.emoji_id ASC
        `,
        [msg.message_id]
      );

      msg.reactions = reactionRows;
      msg.displayTime = formatMessageTime(msg.sent_datetime);
      msg.isMine = msg.user_id === userId;
    }

    // 4. load members
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

    // 5. load emojis
    const [emojis] = await db.query(
      `
      SELECT emoji_id, name
      FROM emoji
      ORDER BY emoji_id ASC
      `
    );

    // 6. get latest message id and mark as read AFTER saving old value
    const latestMessageId =
      messages.length > 0 ? messages[messages.length - 1].message_id : null;

    if (latestMessageId) {
      await db.query(
        `
        UPDATE room_user
        SET last_read_message_id = ?
        WHERE room_id = ? AND user_id = ?
        `,
        [latestMessageId, roomId, userId]
      );
    }

    // 7. render using OLD lastReadMessageId
    res.render('room', {
      roomId,
      messages,
      members,
      emojis,
      currentUser: req.session.user,
      lastReadMessageId
    });
  } catch (error) {
    console.error('Room error:', error);
    res.status(500).send('Server error');
  }
});

router.get('/rooms/:roomId/invite', requireLogin, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const userId = req.session.user.user_id;

    // Check authorization
    const [rows] = await db.query(
      `SELECT * FROM room_user WHERE room_id = ? AND user_id = ?`,
      [roomId, userId]
    );

    if (rows.length === 0) {
      return res.status(400).send("You are not allowed to access this room.");
    }

    // Current members
    const [members] = await db.query(
      `
      SELECT u.user_id, u.username, u.email
      FROM room_user ru
      JOIN user u ON ru.user_id = u.user_id
      WHERE ru.room_id = ?
      `,
      [roomId]
    );

    // Users NOT already in the room
    const [users] = await db.query(
      `
      SELECT user_id, username, email
      FROM user
      WHERE user_id NOT IN (
        SELECT user_id FROM room_user WHERE room_id = ?
      )
      `,
      [roomId]
    );

    res.render("invite", {
      roomId,
      members,
      users
    });

  } catch (error) {
    console.error("Invite page error:", error);
    res.status(500).send("Server error");
  }
});

router.post('/rooms/:roomId/invite', requireLogin, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const currentUserId = req.session.user.user_id;
    const invitedUserId = req.body.userId;

    // Authorization: current user must belong to the room
    const [rows] = await db.query(
      `SELECT * FROM room_user WHERE room_id = ? AND user_id = ?`,
      [roomId, currentUserId]
    );

    if (rows.length === 0) {
      return res.status(400).send("You are not allowed to invite users to this room.");
    }

    // Prevent duplicate membership
    const [existing] = await db.query(
      `SELECT * FROM room_user WHERE room_id = ? AND user_id = ?`,
      [roomId, invitedUserId]
    );

    if (existing.length === 0) {
      await db.query(
        `INSERT INTO room_user (user_id, room_id) VALUES (?, ?)`,
        [invitedUserId, roomId]
      );
    }

    res.redirect(`/rooms/${roomId}/invite`);
  } catch (error) {
    console.error("Invite user error:", error);
    res.status(500).send("Failed to invite user.");
  }
});


module.exports = router;