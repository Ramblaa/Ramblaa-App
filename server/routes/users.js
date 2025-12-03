/**
 * User Management Routes
 * CRUD operations for users (admin only)
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { getDbWithPrepare as getDb } from '../db/index.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/users - List all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const users = await db.prepare(
      `SELECT id, email, first_name, last_name, role, account_id, is_active, email_verified, created_at, last_login 
       FROM users ORDER BY created_at DESC`
    ).all();

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        accountId: u.account_id,
        isActive: u.is_active,
        emailVerified: u.email_verified,
        createdAt: u.created_at,
        lastLogin: u.last_login
      }))
    });
  } catch (error) {
    console.error('[Users] List error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view themselves unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDb();
    const user = await db.prepare(
      `SELECT id, email, first_name, last_name, role, account_id, is_active, email_verified, created_at, last_login 
       FROM users WHERE id = ?`
    ).get([id]);

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
        isActive: user.is_active,
        emailVerified: user.email_verified,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }
    });
  } catch (error) {
    console.error('[Users] Get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', [
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('role').optional().isIn(['admin', 'user']),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { id } = req.params;
    
    // Users can only update themselves (name only) unless they're admin
    const isAdmin = req.user.role === 'admin';
    const isSelf = req.user.id === id;
    
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDb();
    const { firstName, lastName, role, isActive } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (firstName !== undefined) {
      updates.push(`first_name = ?`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = ?`);
      values.push(lastName);
    }
    
    // Only admin can update role and active status
    if (isAdmin) {
      if (role !== undefined) {
        updates.push(`role = ?`);
        values.push(role);
      }
      if (isActive !== undefined) {
        updates.push(`is_active = ?`);
        values.push(isActive);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await db.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).run(values);

    // Fetch updated user
    const user = await db.prepare(
      `SELECT id, email, first_name, last_name, role, account_id, is_active, email_verified, created_at, last_login 
       FROM users WHERE id = ?`
    ).get([id]);

    res.json({
      message: 'User updated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        accountId: user.account_id,
        isActive: user.is_active,
        emailVerified: user.email_verified,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }
    });
  } catch (error) {
    console.error('[Users] Update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id/password - Change password
router.put('/:id/password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one letter, one number, and one special character')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { id } = req.params;
    
    // Users can only change their own password unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getDb();
    const { currentPassword, newPassword } = req.body;

    // Get current password hash
    const user = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get([id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password (skip for admin changing another user's password)
    if (req.user.id === id) {
      const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.prepare(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run([passwordHash, id]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('[Users] Password change error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent self-deletion
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const db = getDb();

    // Delete user sessions first
    await db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run([id]);
    
    // Delete user
    const result = await db.prepare('DELETE FROM users WHERE id = ?').run([id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[Users] Delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

