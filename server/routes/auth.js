/**
 * Authentication Routes
 * Login, signup, token refresh, logout, email verification
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { config } from '../config/env.js';
import { getDbWithPrepare as getDb } from '../db/index.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';

const router = express.Router();

// Password validation rules
const passwordValidation = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one letter, one number, and one special character')
];

// Generate JWT tokens
const generateTokens = (userId, email, role, accountId) => {
  const accessToken = jwt.sign(
    { userId, email, role, accountId },
    config.jwt.secret,
    { expiresIn: config.jwt.accessTokenExpiry }
  );
  
  const refreshToken = jwt.sign(
    { userId },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshTokenExpiry }
  );
  
  return { accessToken, refreshToken };
};

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { email, password } = req.body;
    const db = getDb();

    // Find user
    const user = await db.prepare(
      'SELECT id, email, password_hash, role, is_active, email_verified, first_name, last_name, account_id FROM users WHERE email = ?'
    ).get([email]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Check email verification
    if (!user.email_verified) {
      return res.status(401).json({
        error: 'Please verify your email before logging in',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role, user.account_id);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare(
      'INSERT INTO user_sessions (user_id, refresh_token, expires_at) VALUES (?, ?, ?)'
    ).run([user.id, refreshToken, expiresAt]);

    // Update last login
    await db.prepare(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
    ).run([user.id]);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        accountId: user.account_id,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register (Admin only)
router.post('/register', authenticateToken, requireAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 }),
  body('role').isIn(['admin', 'user']),
  ...passwordValidation
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName, role = 'user' } = req.body;
    const db = getDb();

    // Check if user exists
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get([email]);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await db.prepare(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified) 
       VALUES (?, ?, ?, ?, ?, true, true) RETURNING id`
    ).get([email, passwordHash, firstName, lastName, role]);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: result?.id,
        email,
        firstName,
        lastName,
        role
      }
    });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/signup (Public signup)
router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  ...passwordValidation
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName } = req.body;
    const db = getDb();

    // Check if user exists
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get([email]);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user (inactive until email is verified)
    const result = await db.prepare(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified, email_verification_token, email_verification_expires)
       VALUES (?, ?, ?, ?, 'user', false, false, ?, ?) RETURNING id`
    ).get([email, passwordHash, firstName, lastName, verificationToken, verificationExpires]);

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verificationToken, firstName);
    if (!emailResult.success) {
      console.warn('[Auth] Failed to send verification email:', emailResult.error);
    }

    res.status(201).json({
      message: 'Account created! Please check your email to verify your account.',
      user: {
        id: result?.id,
        email,
        firstName,
        lastName
      }
    });
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const db = getDb();

    // Check if refresh token exists in database
    const session = await db.prepare(
      'SELECT user_id FROM user_sessions WHERE refresh_token = ? AND expires_at > CURRENT_TIMESTAMP'
    ).get([refreshToken]);

    if (!session) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Get user details
    const user = await db.prepare(
      'SELECT id, email, role, is_active, account_id FROM users WHERE id = ?'
    ).get([decoded.userId]);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, accountId: user.account_id },
      config.jwt.secret,
      { expiresIn: config.jwt.accessTokenExpiry }
    );

    res.json({ accessToken });
  } catch (error) {
    console.error('[Auth] Refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const db = getDb();
      await db.prepare('DELETE FROM user_sessions WHERE refresh_token = ?').run([refreshToken]);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.prepare(
      'SELECT id, email, first_name, last_name, role, account_id, created_at, last_login FROM users WHERE id = ?'
    ).get([req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        accountId: user.account_id,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }
    });
  } catch (error) {
    console.error('[Auth] Me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', [
  body('token').trim().notEmpty().withMessage('Verification token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { token } = req.body;
    const db = getDb();

    // Find user with this verification token
    const user = await db.prepare(
      `SELECT id, email, first_name, last_name, email_verification_expires 
       FROM users 
       WHERE email_verification_token = ? AND email_verified = false`
    ).get([token]);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // Check if token has expired
    if (new Date() > new Date(user.email_verification_expires)) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    // Verify the user's email and activate account
    await db.prepare(
      `UPDATE users 
       SET email_verified = true, 
           is_active = true, 
           email_verification_token = NULL, 
           email_verification_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run([user.id]);

    res.json({
      message: 'Email verified successfully! Your account is now active.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: true,
        isActive: true
      }
    });
  } catch (error) {
    console.error('[Auth] Verify email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { email } = req.body;
    const db = getDb();

    // Find user
    const user = await db.prepare(
      'SELECT id, first_name, email_verified FROM users WHERE email = ?'
    ).get([email]);

    // Don't reveal if email exists for security
    const successMessage = 'If an account with this email exists and is unverified, a verification email has been sent.';

    if (!user || user.email_verified) {
      return res.json({ message: successMessage });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Update user with new token
    await db.prepare(
      `UPDATE users
       SET email_verification_token = ?,
           email_verification_expires = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run([verificationToken, verificationExpires, user.id]);

    // Send verification email
    await sendVerificationEmail(email, verificationToken, user.first_name);

    res.json({ message: successMessage });
  } catch (error) {
    console.error('[Auth] Resend verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { email } = req.body;
    const db = getDb();

    // Find user
    const user = await db.prepare(
      'SELECT id, first_name, is_active FROM users WHERE email = ?'
    ).get([email]);

    // Always return success to prevent email enumeration
    const successMessage = 'If an account with this email exists, a password reset link has been sent.';

    if (!user || !user.is_active) {
      return res.json({ message: successMessage });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Store reset token
    await db.prepare(
      `UPDATE users
       SET password_reset_token = ?,
           password_reset_expires = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run([resetToken, resetExpires, user.id]);

    // Send reset email
    await sendPasswordResetEmail(email, resetToken, user.first_name);

    res.json({ message: successMessage });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').trim().notEmpty().withMessage('Reset token is required'),
  ...passwordValidation
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { token, password } = req.body;
    const db = getDb();

    // Find user with valid reset token
    const user = await db.prepare(
      `SELECT id, email, password_reset_expires
       FROM users
       WHERE password_reset_token = ?`
    ).get([token]);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Check if token has expired
    if (new Date() > new Date(user.password_reset_expires)) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and clear reset token
    await db.prepare(
      `UPDATE users
       SET password_hash = ?,
           password_reset_token = NULL,
           password_reset_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run([passwordHash, user.id]);

    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

