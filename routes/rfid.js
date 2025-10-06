const express = require('express');
const RFIDScan = require('../models/RFIDScan');
const User = require('../models/User');
const VehiclePassApplication = require('../models/VehiclePassApplication');
const { validateRFIDScan, validateRFIDAssignment } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const FirebaseService = require('../services/firebaseService'); // Import Firebase service

const router = express.Router();

// @route   POST /api/rfid/scan
// @desc    Validate RFID tag and log the attempt (single consolidated endpoint)
// @access  Public (for scanner devices)
router.post('/scan', validateRFIDScan, async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Accept either JSON { tagId } or raw text/plain body containing only the tag
    const body = req.body;
    const tagId = typeof body === 'string' ? body.trim() : body && body.tagId;
    const scanType = typeof body === 'object' ? body.scanType : undefined;
    const direction = typeof body === 'object' ? body.direction : undefined;
    const systemStatus = typeof body === 'object' ? body.systemStatus : undefined;
    const batteryLevel = typeof body === 'object' ? body.batteryLevel : undefined;
    const signalStrength = typeof body === 'object' ? body.signalStrength : undefined;
    const metadata = typeof body === 'object' ? body.metadata : undefined;

    if (!tagId) {
      return res.status(400).json({
        success: false,
        code: 'TAG_REQUIRED',
        message: 'RFID tag ID is required'
      });
    }

    // Lookup application by tag
    const application = await VehiclePassApplication.findOne({ 'rfidInfo.tagId': tagId });

    const commonLog = {
      tagId,
      scanType: scanType || 'validation',
      direction: direction || 'both',
      scanTimestamp: new Date(),
      responseTime: Date.now() - startTime,
      systemStatus: systemStatus || 'online',
      batteryLevel,
      signalStrength,
      metadata
    };

    if (!application) {
      const log = new RFIDScan({
        ...commonLog,
        user: null,
        vehicle: null,
        scanResult: 'denied',
        scanMessage: 'RFID tag not found',
        errorCode: 'TAG_NOT_FOUND'
      });
      await log.save();
      return res.status(404).json({ success: false, code: 'TAG_NOT_FOUND', message: 'RFID tag is not assigned to any application', scanId: log._id, timestamp: log.scanTimestamp });
    }

    if (!application.rfidInfo || !application.rfidInfo.isActive) {
      const log = new RFIDScan({
        ...commonLog,
        user: application.linkedUser,
        vehicle: application._id,
        scanResult: 'denied',
        scanMessage: 'RFID tag is not active',
        errorCode: 'TAG_INACTIVE'
      });
      await log.save();
      return res.status(423).json({ success: false, code: 'TAG_INACTIVE', message: 'RFID tag is not active', scanId: log._id, timestamp: log.scanTimestamp });
    }

    if (application.status !== 'completed') {
      const log = new RFIDScan({
        ...commonLog,
        user: application.linkedUser,
        vehicle: application._id,
        scanResult: 'denied',
        scanMessage: 'Application not completed',
        errorCode: 'APPLICATION_NOT_COMPLETED'
      });
      await log.save();
      return res.status(409).json({ success: false, code: 'APPLICATION_NOT_COMPLETED', message: 'Vehicle pass application is not marked as completed', scanId: log._id, timestamp: log.scanTimestamp });
    }

    const now = new Date();
    if (application.rfidInfo.validUntil && now > new Date(application.rfidInfo.validUntil)) {
      const log = new RFIDScan({
        ...commonLog,
        user: application.linkedUser,
        vehicle: application._id,
        scanResult: 'denied',
        scanMessage: 'RFID tag expired',
        errorCode: 'TAG_EXPIRED'
      });
      await log.save();
      return res.status(410).json({ success: false, code: 'TAG_EXPIRED', message: 'RFID tag validity has expired', scanId: log._id, timestamp: log.scanTimestamp });
    }

    // Valid
    const successLog = new RFIDScan({
      ...commonLog,
      user: application.linkedUser,
      vehicle: application._id,
      scanResult: 'success',
      scanMessage: 'Access granted'
    });
    await successLog.save();

    return res.status(200).json({
      success: true,
      code: 'TAG_VALID',
      message: 'RFID tag is valid and active',
      scanId: successLog._id,
      timestamp: successLog.scanTimestamp,
      application: {
        id: application._id,
        status: application.status,
        rfidInfo: {
          tagId: application.rfidInfo.tagId,
          isActive: application.rfidInfo.isActive,
          assignedAt: application.rfidInfo.assignedAt,
          validUntil: application.rfidInfo.validUntil
        },
        vehicleInfo: application.vehicleInfo
      }
    });

  } catch (error) {
    console.error('RFID scan error:', error);
    
    // Log error scan
    const errorScan = new RFIDScan({
      tagId: (typeof req.body === 'string' ? req.body.trim() : (req.body && req.body.tagId)) || 'UNKNOWN',
      user: null,
      scanType: req.body.scanType || 'unknown',
      scanResult: 'error',
      scanMessage: 'System error occurred',
      direction: req.body.direction || 'unknown',
      scanTimestamp: new Date(),
      responseTime: Date.now() - startTime,
      systemStatus: req.body.systemStatus || 'offline',
      errorCode: 'SYSTEM_ERROR',
      errorMessage: error.message
    });

    await errorScan.save();

    res.status(500).json({
      success: false,
      message: 'System error occurred',
      scanId: errorScan._id,
      timestamp: errorScan.scanTimestamp
    });
  }
});

// @route   POST /api/rfid/assign
// @desc    Assign RFID tag to a completed, paid VehiclePass application
// @access  Private (Admin)
router.post('/assign', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { applicationId, tagId } = req.body;

    if (!applicationId || !tagId) {
      return res.status(400).json({ error: 'applicationId and tagId are required' });
    }

    // Ensure tag is not already assigned to another application
    const existingWithTag = await VehiclePassApplication.findOne({ 'rfidInfo.tagId': tagId });
    if (existingWithTag && existingWithTag._id.toString() !== applicationId) {
      return res.status(409).json({ error: 'RFID tag is already assigned to another application' });
    }

    const application = await VehiclePassApplication.findById(applicationId)
      .populate('linkedUser', 'firstName lastName email'); // Populate user data

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'approved' && application.status !== 'completed') {
      return res.status(409).json({ 
        error: 'Application must be approved or completed to assign RFID' 
      });
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
    // Add this line to change status to 'completed'
    application.status = 'completed';

    await application.save();

    // ✅ Send notification to the user via Firebase
    try {
      const userId = application.linkedUser._id.toString();
      const userFirstName = application.applicant.givenName || 'there';
      const vehicleType = application.vehicleInfo.type;
      const plateNumber = application.vehicleInfo.plateNumber;
      
      await FirebaseService.addUserNotification(userId, {
        title: 'Vehicle Pass Application Completed! 🎉',
        message: `Hi ${userFirstName}, great news! Your ${vehicleType.replace('_', ' ')} vehicle pass (${plateNumber}) has been successfully processed and your RFID tag is now active. You can now use your vehicle pass for campus access.`,
        type: 'success',
        data: {
          applicationId: application._id.toString(),
          tagId: tagId,
          vehiclePlate: application.vehicleInfo?.plateNumber,
          assignedAt: now.toISOString(),
          validUntil: oneYearLater.toISOString()
        }
      });

      console.log(`Notification sent to user ${userId} for RFID assignment`);
    } catch (notificationError) {
      console.error('Failed to send Firebase notification:', notificationError);
      // Don't fail the main request if notification fails
    }

    return res.status(200).json({
      message: 'RFID tag assigned successfully',
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

// @route   GET /api/rfid/scanId
// @desc    Check RFID tag status and return only status code
// @access  Public (no middleware)
router.get('/scanId', async (req, res) => {
  try {
    const { tagId } = req.query;

    if (!tagId) {
      return res.status(400).end();
    }

    // Lookup application by tag
    const application = await VehiclePassApplication.findOne({ 'rfidInfo.tagId': tagId });

    if (!application) {
      return res.status(404).end();
    }

    if (!application.rfidInfo || !application.rfidInfo.isActive) {
      return res.status(423).end();
    }

    if (application.status !== 'completed') {
      return res.status(409).end();
    }

    const now = new Date();
    if (application.rfidInfo.validUntil && now > new Date(application.rfidInfo.validUntil)) {
      return res.status(410).end();
    }

    // Valid tag
    return res.status(200).end();

  } catch (error) {
    console.error('RFID scanId error:', error);
    return res.status(500).end();
  }
});

// Removed: /api/rfid/validate-tag and /api/rfid/validate (consolidated into /api/rfid/scan)

module.exports = router;
