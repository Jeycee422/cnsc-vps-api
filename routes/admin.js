const express = require('express');
const User = require('../models/User');
const VehiclePassApplication = require('../models/VehiclePassApplication');
const RFIDScan = require('../models/RFIDScan');
const { validateUserId, validatePagination, validateDateRange } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const FirebaseService = require('../services/firebaseService'); // Import Firebase service

const router = express.Router();

// Apply admin middleware to all routes
router.use(authenticateToken, requireAdmin);

router.get('/ping', (req, res) => {
  res.json({ message: 'Admin routes are mounted!' });
});

// @route   GET /api/admin/users
// @desc    Get all users with pagination and filters
// @access  Private (Admin)
router.get('/users', validatePagination, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      status, 
      passType, 
      hasRFID 
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    // Search filter
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Vehicle pass filters are no longer on User; ignored

    // Registration status filter removed

    // RFID assignment filter no longer applicable; ignored

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNext: skip + users.length < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to get users',
      message: error.message
    });
  }
});

// @route   GET /api/admin/users/:userId
// @desc    Get specific user details
// @access  Private (Admin)
router.get('/users/:userId', validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password');

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Get user's scan history
    const recentScans = await RFIDScan.find({ user: userId })
      .sort({ scanTimestamp: -1 })
      .limit(10)
      .populate('vehicle', 'plateNumber vehicleType');

    res.json({
      user,
      recentScans
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error.message
    });
  }
});

// @route   PUT /api/admin/users/:userId/approve
// @desc    Approve user registration
// @access  Private (Admin)
// User registration status endpoints removed

// @route   PUT /api/admin/users/:userId/reject
// @desc    Reject user registration
// @access  Private (Admin)
// User registration status endpoints removed

// @route   PUT /api/admin/applications/:applicationId/approve
// @desc    Approve a vehicle pass application
// @access  Private (Admin)
router.put('/applications/:applicationId/approve', async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await VehiclePassApplication.findById(applicationId)
      .populate('linkedUser', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({
        error: 'Vehicle pass application not found'
      });
    }

    if (application.status === 'approved') {
      return res.status(400).json({
        error: 'Application is already approved'
      });
    }

    application.status = 'approved';
    application.reviewedBy = req.user._id;
    await application.save();

    // ✅ Send approval notification to user via Firebase
    try {
      const userId = application.linkedUser._id.toString();
      const userFirstName = application.applicant.givenName || 'there';
      const vehicleType = application.vehicleInfo.type;
      const plateNumber = application.vehicleInfo.plateNumber;
      
      await FirebaseService.addUserNotification(userId, {
        title: 'Application Approved! ✅',
        message: `Hi ${userFirstName}, great news! Your ${vehicleType.replace('_', ' ')} vehicle pass application (${plateNumber}) has been approved. You can now proceed with payment to complete your registration.`,
        type: 'success',
        data: {
          applicationId: application._id.toString(),
          vehiclePlate: plateNumber,
          vehicleType: vehicleType,
          status: 'approved',
          approvedAt: new Date().toISOString()
        }
      });

      console.log(`Approval notification sent to user ${userId}`);
    } catch (notificationError) {
      console.error('Failed to send approval notification:', notificationError);
      // Don't fail the main request if notification fails
    }

    res.json({
      message: 'Vehicle pass application approved successfully',
      application: {
        id: application._id,
        status: application.status,
        reviewedBy: application.reviewedBy,
        applicant: application.applicant,
        vehicleInfo: application.vehicleInfo,
        linkedUser: application.linkedUser
      }
    });

  } catch (error) {
    console.error('Approve application error:', error);
    res.status(500).json({
      error: 'Failed to approve application',
      message: error.message
    });
  }
});

// @route   PUT /api/admin/applications/:applicationId/reject
// @desc    Reject a vehicle pass application
// @access  Private (Admin)
router.put('/applications/:applicationId/reject', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { reason } = req.body;

    const application = await VehiclePassApplication.findById(applicationId)
      .populate('linkedUser', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({
        error: 'Vehicle pass application not found'
      });
    }

    if (application.status === 'rejected') {
      return res.status(400).json({
        error: 'Application is already rejected'
      });
    }

    application.status = 'rejected';
    application.reviewedBy = req.user._id;
    await application.save();

    // ✅ Send rejection notification to user via Firebase
    try {
      const userId = application.linkedUser._id.toString();
      const userFirstName = application.applicant.givenName || 'there';
      const vehicleType = application.vehicleInfo.type;
      const plateNumber = application.vehicleInfo.plateNumber;
      
      await FirebaseService.addUserNotification(userId, {
        title: 'Application Update',
        message: `Hi ${userFirstName}, your ${vehicleType.replace('_', ' ')} vehicle pass application (${plateNumber}) has been reviewed. ${reason ? `Reason: ${reason}` : 'Please check your application details for more information.'}`,
        type: 'warning',
        data: {
          applicationId: application._id.toString(),
          vehiclePlate: plateNumber,
          vehicleType: vehicleType,
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          reason: reason || 'No reason provided'
        }
      });

      console.log(`Rejection notification sent to user ${userId}`);
    } catch (notificationError) {
      console.error('Failed to send rejection notification:', notificationError);
      // Don't fail the main request if notification fails
    }

    res.json({
      message: 'Vehicle pass application rejected',
      reason: reason || 'No reason provided',
      application: {
        id: application._id,
        status: application.status,
        reviewedBy: application.reviewedBy,
        applicant: application.applicant,
        vehicleInfo: application.vehicleInfo,
        linkedUser: application.linkedUser
      }
    });

  } catch (error) {
    console.error('Reject application error:', error);
    res.status(500).json({
      error: 'Failed to reject application',
      message: error.message
    });
  }
});

// @route   PUT /api/admin/applications/:applicationId/issue-rfid
// @desc    Issue RFID tag and complete application (after payment verification)
// @access  Private (Admin)
router.put('/applications/:applicationId/issue-rfid', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { tagId, orReceiptNumber, amount, cashierName } = req.body;

    if (!tagId) {
      return res.status(400).json({
        error: 'RFID tag ID is required'
      });
    }

    const application = await VehiclePassApplication.findById(applicationId)
      .populate('linkedUser', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({
        error: 'Vehicle pass application not found'
      });
    }

    if (application.status !== 'approved') {
      return res.status(400).json({
        error: 'Application must be approved before issuing RFID tag'
      });
    }

    // Check if RFID tag is already assigned to another application
    const existingTag = await VehiclePassApplication.findOne({ 'rfidInfo.tagId': tagId });
    if (existingTag) {
      return res.status(400).json({
        error: 'RFID tag is already assigned to another application'
      });
    }

    application.status = 'completed';
    application.paymentInfo = {
      paidAt: new Date(),
      orReceiptNumber,
      amount,
      cashierName
    };
    application.rfidInfo = {
      tagId,
      assignedAt: new Date(),
      assignedBy: req.user._id,
      isActive: true
    };
    await application.save();

    // ✅ Send completion notification to user via Firebase
    try {
      const userId = application.linkedUser._id.toString();
      const userFirstName = application.applicant.givenName || 'there';
      const vehicleType = application.vehicleInfo.type;
      const plateNumber = application.vehicleInfo.plateNumber;
      
      await FirebaseService.addUserNotification(userId, {
        title: 'Vehicle Pass Completed! 🎉',
        message: `Hi ${userFirstName}, great news! Your ${vehicleType.replace('_', ' ')} vehicle pass (${plateNumber}) has been completed and your RFID tag is now active. You can now use your vehicle pass for campus access.`,
        type: 'success',
        data: {
          applicationId: application._id.toString(),
          tagId: tagId,
          vehiclePlate: plateNumber,
          vehicleType: vehicleType,
          assignedAt: new Date().toISOString(),
          status: 'completed'
        }
      });

      console.log(`Completion notification sent to user ${userId}`);
    } catch (notificationError) {
      console.error('Failed to send completion notification:', notificationError);
      // Don't fail the main request if notification fails
    }

    res.json({
      message: 'RFID tag issued and application completed successfully',
      application: {
        id: application._id,
        status: application.status,
        paymentInfo: application.paymentInfo,
        rfidInfo: application.rfidInfo,
        applicant: application.applicant,
        vehicleInfo: application.vehicleInfo,
        linkedUser: application.linkedUser
      }
    });

  } catch (error) {
    console.error('Issue RFID error:', error);
    res.status(500).json({
      error: 'Failed to issue RFID tag',
      message: error.message
    });
  }
});

// @route   PUT /api/admin/applications/:applicationId/deactivate-rfid
// @desc    Deactivate RFID tag
// @access  Private (Admin)
router.put('/applications/:applicationId/deactivate-rfid', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { reason } = req.body;

    const application = await VehiclePassApplication.findById(applicationId)
      .populate('linkedUser', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({
        error: 'Vehicle pass application not found'
      });
    }

    if (application.status !== 'completed') {
      return res.status(400).json({
        error: 'Application must be completed to deactivate RFID'
      });
    }

    application.rfidInfo.isActive = false;
    await application.save();

    // ✅ Send deactivation notification to user via Firebase
    try {
      const userId = application.linkedUser._id.toString();
      const userFirstName = application.applicant.givenName || 'there';
      const vehicleType = application.vehicleInfo.type;
      const plateNumber = application.vehicleInfo.plateNumber;
      
      await FirebaseService.addUserNotification(userId, {
        title: 'RFID Tag Deactivated',
        message: `Hi ${userFirstName}, your ${vehicleType.replace('_', ' ')} vehicle pass (${plateNumber}) RFID tag has been deactivated. ${reason ? `Reason: ${reason}` : 'Please contact administration for more information.'}`,
        type: 'warning',
        data: {
          applicationId: application._id.toString(),
          vehiclePlate: plateNumber,
          vehicleType: vehicleType,
          status: 'deactivated',
          deactivatedAt: new Date().toISOString(),
          reason: reason || 'No reason provided'
        }
      });

      console.log(`Deactivation notification sent to user ${userId}`);
    } catch (notificationError) {
      console.error('Failed to send deactivation notification:', notificationError);
      // Don't fail the main request if notification fails
    }

    res.json({
      message: 'RFID tag deactivated successfully',
      reason: reason || 'No reason provided',
      application: {
        id: application._id,
        status: application.status,
        rfidInfo: application.rfidInfo,
        applicant: application.applicant,
        vehicleInfo: application.vehicleInfo,
        linkedUser: application.linkedUser
      }
    });

  } catch (error) {
    console.error('Deactivate RFID error:', error);
    res.status(500).json({
      error: 'Failed to deactivate RFID tag',
      message: error.message
    });
  }
});

// @route   GET /api/admin/applications/:applicationId
// @desc    Get specific vehicle pass application details
// @access  Private (Admin)
router.get('/applications/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await VehiclePassApplication.findById(applicationId)
      .populate('linkedUser', 'firstName lastName email phoneNumber address affiliation')
      .populate('reviewedBy', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({
        error: 'Vehicle pass application not found'
      });
    }

    res.json({
      application
    });

  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({
      error: 'Failed to get application',
      message: error.message
    });
  }
});

// @route   GET /api/admin/applications
// @desc    Get all vehicle pass applications with pagination and filters
// @access  Private (Admin)
router.get('/applications', validatePagination, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      status, 
      schoolAffiliation,
      vehicleUserType
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    // Search filter
    if (search) {
      query.$or = [
        { 'applicant.familyName': { $regex: search, $options: 'i' } },
        { 'applicant.givenName': { $regex: search, $options: 'i' } },
        { 'vehicleInfo.plateNumber': { $regex: search, $options: 'i' } },
        { idNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // School affiliation filter
    if (schoolAffiliation) {
      query.schoolAffiliation = schoolAffiliation;
    }

    // Vehicle user type filter
    if (vehicleUserType) {
      query.vehicleUserType = vehicleUserType;
    }

    const applications = await VehiclePassApplication.find(query)
      .populate('linkedUser', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await VehiclePassApplication.countDocuments(query);

    res.json({
      applications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalApplications: total,
        hasNext: skip + applications.length < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({
      error: 'Failed to get applications',
      message: error.message
    });
  }
});

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Private (Admin)
router.get('/dashboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // User statistics
    const totalUsers = await User.countDocuments();

    // Vehicle statistics
    const totalApplications = await VehiclePassApplication.countDocuments();
    const pendingApplications = await VehiclePassApplication.countDocuments({ status: 'pending' });
    const approvedApplications = await VehiclePassApplication.countDocuments({ status: 'approved' });
    const completedApplications = await VehiclePassApplication.countDocuments({ status: 'completed' }); // Added this line
    const rejectedApplications = await VehiclePassApplication.countDocuments({ status: 'rejected' });

    // Scan statistics
    const totalScans = await RFIDScan.countDocuments();
    const successfulScans = await RFIDScan.countDocuments({ scanResult: 'success' });
    const deniedScans = await RFIDScan.countDocuments({ scanResult: 'denied' });

    // Recent activity
    const recentScans = await RFIDScan.find()
      .sort({ scanTimestamp: -1 })
      .limit(10)
      .populate('user', 'firstName lastName')
      .populate('vehicle', 'vehicleInfo.plateNumber vehicleInfo.type'); // Updated field structure

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('firstName lastName email createdAt');

    res.json({
      statistics: {
        users: {
          total: totalUsers
        },
        vehicles: {
          total: totalApplications,
          pending: pendingApplications,
          approved: approvedApplications,
          completed: completedApplications, // Added this line
          rejected: rejectedApplications
        },
        scans: {
          total: totalScans,
          successful: successfulScans,
          denied: deniedScans
        }
      },
      recentActivity: {
        scans: recentScans,
        users: recentUsers
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard data',
      message: error.message
    });
  }
});

// @route   GET /api/admin/reports/scans
// @desc    Get scan reports with date range
// @access  Private (Admin)
router.get('/reports/scans', validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate, scannerId, scanType } = req.query;

    const query = {};
    
    if (startDate && endDate) {
      query.scanTimestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (scannerId) {
      query.scannerId = scannerId;
    }

    if (scanType) {
      query.scanType = scanType;
    }

    const scans = await RFIDScan.find(query)
      .populate('user', 'firstName lastName email')
      .populate('vehicle', 'plateNumber vehicleType')
      .sort({ scanTimestamp: -1 });

    // Group by scan result
    const scanResults = scans.reduce((acc, scan) => {
      acc[scan.scanResult] = (acc[scan.scanResult] || 0) + 1;
      return acc;
    }, {});

    // Group by scanner
    const scannerStats = scans.reduce((acc, scan) => {
      if (!acc[scan.scannerId]) {
        acc[scan.scannerId] = {
          total: 0,
          success: 0,
          denied: 0,
          error: 0
        };
      }
      acc[scan.scannerId].total += 1;
      acc[scan.scannerId][scan.scanResult] += 1;
      return acc;
    }, {});

    res.json({
      totalScans: scans.length,
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      scanResults,
      scannerStats,
      scans
    });

  } catch (error) {
    console.error('Scan reports error:', error);
    res.status(500).json({
      error: 'Failed to get scan reports',
      message: error.message
    });
  }
});

module.exports = router;