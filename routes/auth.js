const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/mysql');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.render('login', { error: 'All fields are required.' });
    }

    const [users] = await db.query(
      'SELECT * FROM user WHERE email = ? OR username = ?',
      [login, login]
    );

    if (users.length === 0) {
      return res.render('login', { error: 'Invalid email/username or password.' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.render('login', { error: 'Invalid email/username or password.' });
    }

    req.session.user = {
      user_id: user.user_id,
      username: user.username,
      email: user.email
    };

    res.redirect('/rooms');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Something went wrong during login.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Logout failed.');
    }
    res.redirect('/login');
  });
});

router.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

router.post('/signup', async (req, res) => {
  try {
    const { email, username, password, confirmPassword } = req.body;

    if (!email || !username || !password || !confirmPassword) {
      return res.render('signup', { error: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.render('signup', { error: 'Passwords do not match.' });
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,}$/;

    if (!passwordRegex.test(password)) {
      return res.render('signup', {
        error:
          'Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.'
      });
    }

    const [existingUsers] = await db.query(
      'SELECT * FROM user WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existingUsers.length > 0) {
      return res.render('signup', {
        error: 'Email or username already exists.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO user (email, username, password_hash) VALUES (?, ?, ?)',
      [email, username, hashedPassword]
    );

    res.redirect('/login');
  } catch (error) {
    console.error('Signup error:', error);
    res.render('signup', { error: 'Something went wrong during signup.' });
  }
});

module.exports = router;