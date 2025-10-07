const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireSystemAdmin } = require('../middleware/auth');
const router = express.Router();

// Validation chain for creating privileged accounts
const createUserValidators = [
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phoneNumber').trim().notEmpty(),
  body('address').trim().notEmpty(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['security_guard', 'admin', 'super_admin'])
];

// POST /api/system-admin/users
// Create accounts for security_guard, admin, super_admin
router.post('/users', authenticateToken, requireSystemAdmin, createUserValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, middleName, lastName, email, phoneNumber, address, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const user = new User({
      firstName,
      middleName,
      lastName,
      email,
      phoneNumber,
      address,
      password,
      role
    });

    await user.save();

    return res.status(201).json({
      message: 'User created successfully',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address,
        role: user.role
      }
    });
  } catch (err) {
    console.error('System admin create user error:', err);
    return res.status(500).json({ error: 'Failed to create user', message: err.message });
  }
});

// List privileged users with optional role filter
router.get('/users', authenticateToken, requireSystemAdmin, [
  query('role').optional().isIn(['security_guard', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { role } = req.query;
    const filter = role ? { role } : { role: { $in: ['security_guard', 'admin', 'super_admin'] } };

    const users = await User.find(filter).select('_id firstName lastName email phoneNumber address role createdAt');

    return res.json({ users });
  } catch (err) {
    console.error('System admin list users error:', err);
    return res.status(500).json({ error: 'Failed to list users', message: err.message });
  }
});

// Update a privileged user (security_guard, admin, super_admin)
router.put('/users/:userId', authenticateToken, requireSystemAdmin, [
  body('firstName').optional().trim().notEmpty(),
  body('middleName').optional().trim(),
  body('lastName').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phoneNumber').optional().trim().notEmpty(),
  body('address').optional().trim().notEmpty(),
  body('password').optional().isLength({ min: 8 }),
  body('role').optional().isIn(['security_guard', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const updates = { ...req.body };

    console.log('🔄 Updating user:', userId);
    console.log('📝 Update data received:', Object.keys(updates));

    // Ensure only target roles are managed
    const target = await User.findById(userId);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!['security_guard', 'admin', 'super_admin'].includes(target.role)) {
      return res.status(403).json({ error: 'Cannot modify this user role' });
    }

    // If email is changing, ensure uniqueness
    if (updates.email && updates.email !== target.email) {
      const existing = await User.findOne({ email: updates.email });
      if (existing) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    // Assign allowed fields
    const assignable = ['firstName', 'middleName', 'lastName', 'email', 'phoneNumber', 'address'];
    assignable.forEach((k) => {
      if (typeof updates[k] !== 'undefined') {
        console.log(`📝 Updating ${k}: ${target[k]} → ${updates[k]}`);
        target[k] = updates[k];
      }
    });
    
    if (typeof updates.role !== 'undefined') {
      console.log(`📝 Updating role: ${target.role} → ${updates.role}`);
      target.role = updates.role;
    }

    // Handle password change - let User model handle hashing via pre-save hook
    if (typeof updates.password !== 'undefined' && updates.password) {
      console.log('🔐 Password update detected - assigning to user model for hashing');
      target.password = updates.password;
      // The User model's pre-save hook will automatically hash this password
    }

    console.log('💾 Saving user document...');
    
    // Save the document - this will trigger the pre-save hook for password hashing
    await target.save();
    
    console.log('✅ User updated successfully');

    return res.json({
      message: 'User updated successfully',
      user: {
        _id: target._id,
        firstName: target.firstName,
        lastName: target.lastName,
        email: target.email,
        phoneNumber: target.phoneNumber,
        address: target.address,
        role: target.role
      }
    });
  } catch (err) {
    console.error('❌ System admin update user error:', err);
    return res.status(500).json({ error: 'Failed to update user', message: err.message });
  }
});

// Delete a privileged user (security_guard, admin, super_admin)
router.delete('/users/:userId', authenticateToken, requireSystemAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const target = await User.findById(userId);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!['security_guard', 'admin', 'super_admin'].includes(target.role)) {
      return res.status(403).json({ error: 'Cannot delete this user role' });
    }

    await target.deleteOne();
    return res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('System admin delete user error:', err);
    return res.status(500).json({ error: 'Failed to delete user', message: err.message });
  }
});

module.exports = router;