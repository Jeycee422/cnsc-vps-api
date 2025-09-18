const express = require('express');
const RFIDScan = require('../models/RFIDScan');
const User = require('../models/User');
const VehiclePassApplication = require('../models/VehiclePassApplication');
const { validateRFIDScan, validateRFIDAssignment } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/rfid/scan
// @desc    Validate RFID tag and log the attempt (status-code only response)
// @access  Public (for scanner devices)
router.post('/scan', validateRFIDScan, async (req, res) => {
  const startTime = Date.now();

  try {
    const body = req.body;
    const tagId = typeof body === 'string' ? body.trim() : body && body.tagId;

    if (!tagId) {
      return res.sendStatus(400); // Bad Request
    }

    // Lookup application by tag
    const application = await VehiclePassApplication.findOne({ 'rfidInfo.tagId': tagId });

    const commonLog = {
      tagId,
      scanType: (typeof body === 'object' && body.scanType) || 'validation',
      direction: (typeof body === 'object' && body.direction) || 'both',
      scanTimestamp: new Date(),
      responseTime: Date.now() - startTime,
      systemStatus: (typeof body === 'object' && body.systemStatus) || 'online',
      batteryLevel: typeof body === 'object' ? body.batteryLevel : undefined,
      signalStrength: typeof body === 'object' ? body.signalStrength : undefined,
      metadata: typeof body === 'object' ? body.metadata : undefined
    };

    if (!application) {
      await new RFIDScan({
        ...commonLog,
        scanResult: 'denied',
        scanMessage: 'RFID tag not found',
        errorCode: 'TAG_NOT_FOUND'
      }).save();
      return res.sendStatus(404); // Not Found
    }

    if (!application.rfidInfo || !application.rfidInfo.isActive) {
      await new RFIDScan({
        ...commonLog,
        user: application.linkedUser,
        vehicle: application._id,
        scanResult: 'denied',
        scanMessage: 'RFID tag is not active',
        errorCode: 'TAG_INACTIVE'
      }).save();
      return res.sendStatus(423); // Locked
    }

    if (application.status !== 'completed') {
      await new RFIDScan({
        ...commonLog,
        user: application.linkedUser,
        vehicle: application._id,
        scanResult: 'denied',
        scanMessage: 'Application not completed',
        errorCode: 'APPLICATION_NOT_COMPLETED'
      }).save();
      return res.sendStatus(409); // Conflict
    }

    if (application.rfidInfo.validUntil && new Date() > new Date(application.rfidInfo.validUntil)) {
      await new RFIDScan({
        ...commonLog,
        user: application.linkedUser,
        vehicle: application._id,
        scanResult: 'denied',
        scanMessage: 'RFID tag expired',
        errorCode: 'TAG_EXPIRED'
      }).save();
      return res.sendStatus(410); // Gone
    }

    // ✅ Valid
    await new RFIDScan({
      ...commonLog,
      user: application.linkedUser,
      vehicle: application._id,
      scanResult: 'success',
      scanMessage: 'Access granted'
    }).save();

    return res.sendStatus(200); // OK

  } catch (error) {
    console.error('RFID scan error:', error);

    await new RFIDScan({
      tagId: (typeof req.body === 'string' ? req.body.trim() : (req.body && req.body.tagId)) || 'UNKNOWN',
      scanResult: 'error',
      scanMessage: 'System error occurred',
      errorCode: 'SYSTEM_ERROR',
      errorMessage: error.message,
      scanTimestamp: new Date(),
      responseTime: Date.now() - startTime
    }).save();

    return res.sendStatus(500); // Internal Server Error
  }
});


// @route   POST /api/rfid/assign
// @desc    Assign RFID tag to a VehiclePass application (and mark completed)
// @access  Private (Admin)
router.post('/assign', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { applicationId, tagId } = req.body;

    if (!applicationId || !tagId) {
      return res.status(400).json({ error: 'applicationId and tagId are required' });
    }

    // Ensure tag is not already assigned
    const existingWithTag = await VehiclePassApplication.findOne({ 'rfidInfo.tagId': tagId });
    if (existingWithTag && existingWithTag._id.toString() !== applicationId) {
      return res.status(409).json({ error: 'RFID tag is already assigned to another application' });
    }

    const application = await VehiclePassApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Must be at least approved before RFID
    if (application.status !== 'approved') {
      return res.status(409).json({ error: 'Application must be approved before RFID assignment' });
    }

    const now = new Date();
    const oneYearLater = new Date(now);
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    application.rfidInfo = {
      tagId,
      assignedAt: now,
      assignedBy: req.user._id,
      isActive: true,
      validUntil: oneYearLater
    };

    // ✅ mark as completed upon RFID assignment
    application.status = 'completed';

    await application.save();

    return res.status(200).json({
      message: 'RFID tag assigned and application marked as completed',
      application: {
        id: application._id,
        status: application.status,
        rfidInfo: application.rfidInfo,
        vehicleInfo: application.vehicleInfo
      }
    });
  } catch (error) {
    console.error('Assign RFID error:', error);
    return res.status(500).json({ error: 'Failed to assign RFID tag' });
  }
});


// @route   POST /api/rfid/unassign
// @desc    Unassign RFID tag from user (admin only) - DISABLED: User model no longer supports RFID
// @access  Private (Admin)
router.post('/unassign', authenticateToken, requireAdmin, async (req, res) => {
  return res.status(501).json({
    error: 'RFID functionality has been removed from the User model',
    message: 'This endpoint is no longer supported'
  });
});

// @route   GET /api/rfid/scans/:userId
// @desc    Get scan history for a user
// @access  Private
router.get('/scans/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, startDate, endDate } = req.query;

    // Check if user can access this data
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user._id.toString() !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    const skip = (page - 1) * limit;
    const query = { user: userId };

    if (startDate && endDate) {
      query.scanTimestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const scans = await RFIDScan.find(query)
      .sort({ scanTimestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'firstName lastName email')
      .populate('vehicle', 'vehicleInfo.plateNumber vehicleInfo.type');

    const total = await RFIDScan.countDocuments(query);

    res.json({
      scans,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalScans: total,
        hasNext: skip + scans.length < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get scan history error:', error);
    res.status(500).json({
      error: 'Failed to get scan history',
      message: error.message
    });
  }
});

// @route   GET /api/rfid/stats/:userId
// @desc    Get scan statistics for a user
// @access  Private
router.get('/stats/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Check if user can access this data
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user._id.toString() !== userId) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    const stats = await RFIDScan.getScanStats(userId, startDate, endDate);

    res.json({
      userId,
      stats,
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error('Get scan stats error:', error);
    res.status(500).json({
      error: 'Failed to get scan statistics',
      message: error.message
    });
  }
});

// @route   GET /api/rfid/recent
// @desc    Get recent scans (admin only)
// @access  Private (Admin)
router.get('/recent', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const recentScans = await RFIDScan.find()
      .sort({ scanTimestamp: -1 })
      .limit(parseInt(limit))
      .populate('user', 'firstName lastName email')
      .populate('vehicle', 'vehicleInfo.plateNumber vehicleInfo.type');

    res.json({
      recentScans,
      total: recentScans.length
    });

  } catch (error) {
    console.error('Get recent scans error:', error);
    res.status(500).json({
      error: 'Failed to get recent scans',
      message: error.message
    });
  }
});

// Removed: /api/rfid/validate-tag and /api/rfid/validate (consolidated into /api/rfid/scan)

module.exports = router;
