const express = require('express');
const User = require('../models/User');
const VehiclePassApplication = require('../models/VehiclePassApplication');
const { validateUserId } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { uploadVehiclePassFiles, uploadSingleFile, handleUploadError, validateFileUpload } = require('../middleware/fileUpload');
const gridfsStorage = require('../services/gridfsStorage');

const router = express.Router();

// @route   POST /api/vehicle-passes/application
// @desc    Submit vehicle pass application (user self-application) with optional file attachments
// @access  Private
router.post('/application', authenticateToken, uploadVehiclePassFiles, handleUploadError, validateFileUpload, async (req, res) => {
  try {
    const {
      applicant,
      homeAddress,
      schoolAffiliation,
      otherAffiliation,
      idNumber,
      contactNumber,
      employmentStatus,
      company,
      purpose,
      guardianName,
      guardianAddress,
      vehicleUserType,
      vehicleInfo,
      driverName,
      driverLicense
    } = req.body;

    if (!applicant || !homeAddress || !schoolAffiliation || !idNumber || !vehicleUserType || !vehicleInfo) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate school affiliation and vehicle user type against enums in schema
    const validAffiliations = ['student', 'personnel', 'other'];
    const validUserTypes = ['owner', 'driver', 'passenger'];
    if (!validAffiliations.includes(schoolAffiliation)) {
      return res.status(400).json({ error: 'Invalid school affiliation' });
    }
    if (!validUserTypes.includes(vehicleUserType)) {
      return res.status(400).json({ error: 'Invalid vehicle user type' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Ensure no existing application by this user for this vehicle
    const existing = await VehiclePassApplication.findOne({ linkedUser: req.user._id, 'vehicleInfo.plateNumber': vehicleInfo.plateNumber });
    if (existing) {
      return res.status(400).json({ error: 'An application already exists for this vehicle' });
    }

    // Check if any other user has already registered a vehicle with the same plate number, OR number, or CR number
    const duplicateVehicle = await VehiclePassApplication.findOne({
      $or: [
        { 'vehicleInfo.plateNumber': vehicleInfo.plateNumber },
        { 'vehicleInfo.orNumber': vehicleInfo.orNumber },
        { 'vehicleInfo.crNumber': vehicleInfo.crNumber }
      ]
    });

    if (duplicateVehicle) {
      const duplicateFields = [];
      if (duplicateVehicle.vehicleInfo.plateNumber === vehicleInfo.plateNumber) {
        duplicateFields.push('plate number');
      }
      if (duplicateVehicle.vehicleInfo.orNumber === vehicleInfo.orNumber) {
        duplicateFields.push('OR number');
      }
      if (duplicateVehicle.vehicleInfo.crNumber === vehicleInfo.crNumber) {
        duplicateFields.push('CR number');
      }
      
      return res.status(400).json({ 
        error: `Vehicle with the same ${duplicateFields.join(', ')} has already been registered by another user` 
      });
    }

    // Handle file uploads to GridFS
    const attachments = {};
    
    try {
      // Upload OR/CR copy if provided
      if (req.files.orCrCopy && req.files.orCrCopy[0]) {
        const file = req.files.orCrCopy[0];
        const fileName = gridfsStorage.generateUniqueFileName(
          file.originalname, 
          req.user._id.toString(), 
          'orCrCopy'
        );
        
        const uploadResult = await gridfsStorage.uploadFile(
          file.buffer, 
          fileName, 
          file.mimetype,
          { userId: req.user._id.toString(), fileType: 'orCrCopy' }
        );
        
        attachments.orCrCopy = {
          fileId: uploadResult.fileId,
          fileName: uploadResult.fileName,
          uploadedAt: uploadResult.uploadedAt,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType
        };
      }

      // Upload driver's license copy if provided
      if (req.files.driversLicenseCopy && req.files.driversLicenseCopy[0]) {
        const file = req.files.driversLicenseCopy[0];
        const fileName = gridfsStorage.generateUniqueFileName(
          file.originalname, 
          req.user._id.toString(), 
          'driversLicenseCopy'
        );
        
        const uploadResult = await gridfsStorage.uploadFile(
          file.buffer, 
          fileName, 
          file.mimetype,
          { userId: req.user._id.toString(), fileType: 'driversLicenseCopy' }
        );
        
        attachments.driversLicenseCopy = {
          fileId: uploadResult.fileId,
          fileName: uploadResult.fileName,
          uploadedAt: uploadResult.uploadedAt,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType
        };
      }

      // Upload OR cashier receipt if provided
      if (req.files.orCashier && req.files.orCashier[0]) {
        const file = req.files.orCashier[0];
        const fileName = gridfsStorage.generateUniqueFileName(
          file.originalname, 
          req.user._id.toString(), 
          'orCashier'
        );
        
        const uploadResult = await gridfsStorage.uploadFile(
          file.buffer, 
          fileName, 
          file.mimetype,
          { userId: req.user._id.toString(), fileType: 'orCashier' }
        );
        
        attachments.orCashier = {
          fileId: uploadResult.fileId,
          fileName: uploadResult.fileName,
          uploadedAt: uploadResult.uploadedAt,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType
        };
      }
    } catch (uploadError) {
      console.error('File upload error:', uploadError);
      return res.status(500).json({
        error: 'Failed to upload files',
        message: uploadError.message
      });
    }

    const application = new VehiclePassApplication({
      applicant: {
        familyName: applicant.familyName,
        givenName: applicant.givenName,
        middleName: applicant.middleName
      },
      homeAddress,
      schoolAffiliation,
      otherAffiliation,
      idNumber,
      contactNumber,
      employmentStatus: employmentStatus || 'n/a',
      company,
      purpose,
      guardianName,
      guardianAddress,
      vehicleUserType,
      vehicleInfo: {
        type: vehicleInfo.type,
        plateNumber: vehicleInfo.plateNumber,
        orNumber: vehicleInfo.orNumber,
        crNumber: vehicleInfo.crNumber,
        driverName: driverName,
        driverLicense: driverLicense
      },
      attachments: Object.keys(attachments).length > 0 ? attachments : undefined,
      status: 'pending',
      linkedUser: req.user._id
    });

    await application.save();

    res.status(201).json({
      message: 'Vehicle pass application submitted successfully',
      application
    });

  } catch (error) {
    console.error('Vehicle pass application error:', error);
    res.status(500).json({
      error: 'Failed to submit vehicle pass application',
      message: error.message
    });
  }
});

// Walk-in routes moved to routes/walkins.js

// @route   GET /api/vehicle-passes/my-applications
// @desc    Get current user's vehicle pass applications
// @access  Private
router.get('/my-applications', authenticateToken, async (req, res) => {
  try {
    const applications = await VehiclePassApplication.find({ linkedUser: req.user._id })
      .sort({ createdAt: -1 });

    res.json({
      applications,
      total: applications.length
    });

  } catch (error) {
    console.error('Get user applications error:', error);
    res.status(500).json({
      error: 'Failed to get user applications',
      message: error.message
    });
  }
});

// @route   GET /api/vehicle-passes/my-application
// @desc    Get current user's vehicle pass application
// @access  Private
router.get('/my-application', authenticateToken, async (req, res) => {
  try {
    const application = await VehiclePassApplication.findOne({ linkedUser: req.user._id })
      .populate('reviewedBy', 'firstName lastName email')
      .populate('linkedUser', 'firstName lastName email phoneNumber address affiliation');

    if (!application) {
      return res.status(404).json({ error: 'No vehicle pass application found' });
    }

    res.json({ application });

  } catch (error) {
    console.error('Get vehicle pass application error:', error);
    res.status(500).json({
      error: 'Failed to get vehicle pass application',
      message: error.message
    });
  }
});

// @route   GET /api/vehicle-passes/user/:userId
// @desc    Get user's vehicle pass application (admin only)
// @access  Private (Admin)
router.get('/user/:userId', authenticateToken, requireAdmin, validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;

    const application = await VehiclePassApplication.findOne({ linkedUser: userId })
      .populate('reviewedBy', 'firstName lastName email')
      .populate('linkedUser', 'firstName lastName email phoneNumber address');

    if (!application) {
      return res.status(404).json({ error: 'No vehicle pass application found for this user' });
    }

    res.json({ application });

  } catch (error) {
    console.error('Get user vehicle pass application error:', error);
    res.status(500).json({
      error: 'Failed to get user vehicle pass application',
      message: error.message
    });
  }
});

// @route   PUT /api/vehicle-passes/approve/:userId
// @desc    Approve user's vehicle pass application (admin only)
// @access  Private (Admin)
router.put('/approve/:userId', authenticateToken, requireAdmin, validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;

    const application = await VehiclePassApplication.findOne({ linkedUser: userId })
      .populate('linkedUser', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({ error: 'No vehicle pass application found for this user' });
    }

    if (application.status === 'approved') {
      return res.status(400).json({ error: 'Application already approved' });
    }

    application.status = 'approved';
    application.reviewedBy = req.user._id;
    await application.save();

    res.json({
      message: 'Vehicle pass application approved successfully',
      application
    });

  } catch (error) {
    console.error('Approve vehicle pass error:', error);
    res.status(500).json({
      error: 'Failed to approve vehicle pass application',
      message: error.message
    });
  }
});

// Note: Activation/Suspension no longer applicable. Status is managed as pending/approved/rejected.

// Note: Suspension endpoint removed as status does not include suspended.

// @route   PUT /api/vehicle-passes/reject/:userId
// @desc    Reject user's vehicle pass application (admin only)
// @access  Private (Admin)
router.put('/reject/:userId', authenticateToken, requireAdmin, validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const application = await VehiclePassApplication.findOne({ linkedUser: userId })
      .populate('linkedUser', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({ error: 'No vehicle pass application found for this user' });
    }

    application.status = 'rejected';
    application.reviewedBy = req.user._id;
    await application.save();

    res.json({
      message: 'Vehicle pass application rejected',
      reason: reason || 'No reason provided',
      application
    });

  } catch (error) {
    console.error('Reject vehicle pass error:', error);
    res.status(500).json({
      error: 'Failed to reject vehicle pass application',
      message: error.message
    });
  }
});

// @route   GET /api/vehicle-passes/files/:applicationId/:fileType
// @desc    Get file stream from GridFS (user can access their own files, admin can access any)
// @access  Private
router.get('/files/:applicationId/:fileType', authenticateToken, async (req, res) => {
  try {
    const { applicationId, fileType } = req.params;
    
    // Validate file type
    const validFileTypes = ['orCrCopy', 'driversLicenseCopy', 'orCashier'];
    if (!validFileTypes.includes(fileType)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    // Find the application
    const application = await VehiclePassApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check permissions (user can only access their own files, admin can access any)
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isOwner = application.linkedUser.toString() === req.user._id.toString();
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    const fileInfo = application.attachments && application.attachments[fileType];
    if (!fileInfo || !fileInfo.fileId) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file from GridFS
    const fileData = await gridfsStorage.getFileById(fileInfo.fileId);
    
    // Set appropriate headers
    res.set({
      'Content-Type': fileData.file.contentType,
      'Content-Length': fileData.file.length,
      'Content-Disposition': `inline; filename="${fileInfo.fileName}"`
    });

    // Stream the file to response
    fileData.stream.pipe(res);

  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      error: 'Failed to get file',
      message: error.message
    });
  }
});

// @route   PUT /api/vehicle-passes/files/:applicationId/:fileType
// @desc    Update file attachment for existing application
// @access  Private
router.put('/files/:applicationId/:fileType', authenticateToken, uploadSingleFile, handleUploadError, async (req, res) => {
  try {
    const { applicationId, fileType } = req.params;
    
    // Validate file type
    const validFileTypes = ['orCrCopy', 'driversLicenseCopy', 'orCashier'];
    if (!validFileTypes.includes(fileType)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Find the application
    const application = await VehiclePassApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check permissions (user can only update their own files, admin can update any)
    const isAdmin = req.user.role === 'admin';
    const isOwner = application.linkedUser.toString() === req.user._id.toString();
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if application is still editable (not approved or rejected)
    if (application.status === 'approved' || application.status === 'rejected') {
      return res.status(400).json({ error: 'Cannot update files for processed applications' });
    }

    // Delete old file if it exists
    if (application.attachments && application.attachments[fileType] && application.attachments[fileType].fileId) {
      try {
        await gridfsStorage.deleteFileById(application.attachments[fileType].fileId);
      } catch (deleteError) {
        console.warn('Failed to delete old file:', deleteError.message);
        // Continue with upload even if old file deletion fails
      }
    }

    // Upload new file
    const file = req.file;
    const fileName = gridfsStorage.generateUniqueFileName(
      file.originalname, 
      application.linkedUser.toString(), 
      fileType
    );
    
    const uploadResult = await gridfsStorage.uploadFile(
      file.buffer, 
      fileName, 
      file.mimetype,
      { userId: application.linkedUser.toString(), fileType: fileType }
    );

    // Update application with new file info
    if (!application.attachments) {
      application.attachments = {};
    }
    
    application.attachments[fileType] = {
      fileId: uploadResult.fileId,
      fileName: uploadResult.fileName,
      uploadedAt: uploadResult.uploadedAt,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType
    };

    await application.save();

    res.json({
      message: 'File updated successfully',
      fileInfo: application.attachments[fileType]
    });

  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({
      error: 'Failed to update file',
      message: error.message
    });
  }
});

// @route   DELETE /api/vehicle-passes/files/:applicationId/:fileType
// @desc    Delete file attachment from application
// @access  Private
router.delete('/files/:applicationId/:fileType', authenticateToken, async (req, res) => {
  try {
    const { applicationId, fileType } = req.params;
    
    // Validate file type
    const validFileTypes = ['orCrCopy', 'driversLicenseCopy', 'orCashier'];
    if (!validFileTypes.includes(fileType)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    // Find the application
    const application = await VehiclePassApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check permissions (user can only delete their own files, admin can delete any)
    const isAdmin = req.user.role === 'admin';
    const isOwner = application.linkedUser.toString() === req.user._id.toString();
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if application is still editable (not approved or rejected)
    if (application.status === 'approved' || application.status === 'rejected') {
      return res.status(400).json({ error: 'Cannot delete files from processed applications' });
    }

    // Check if file exists
    if (!application.attachments || !application.attachments[fileType] || !application.attachments[fileType].fileId) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file from GridFS
    await gridfsStorage.deleteFileById(application.attachments[fileType].fileId);

    // Remove file info from application
    delete application.attachments[fileType];
    
    // If no attachments left, remove the attachments object
    if (Object.keys(application.attachments).length === 0) {
      application.attachments = undefined;
    }

    await application.save();

    res.json({
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      message: error.message
    });
  }
});

module.exports = router;
