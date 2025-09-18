const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (we'll upload directly to GridFS)
const storage = multer.memoryStorage();

// File filter to validate file types
const fileFilter = (req, file, cb) => {
  // Allowed file types for vehicle pass documents
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'application/pdf',
    'image/webp'
  ];

  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp'];

  // Check MIME type
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Check file extension as fallback
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`), false);
    }
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 3 // Maximum 3 files per request
  }
});

// Middleware for vehicle pass application file uploads
const uploadVehiclePassFiles = upload.fields([
  { name: 'orCrCopy', maxCount: 1 },
  { name: 'driversLicenseCopy', maxCount: 1 },
  { name: 'orCashier', maxCount: 1 }
]);

// Middleware for single file uploads (for updates)
const uploadSingleFile = upload.single('file');

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size must be less than 5MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        message: 'Maximum 3 files allowed per request'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected file field',
        message: 'Only orCrCopy, driversLicenseCopy, and orCashier fields are allowed'
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      error: 'Invalid file type',
      message: error.message
    });
  }

  next(error);
};

// Validation middleware for file uploads
const validateFileUpload = (req, res, next) => {
  // Check if files were uploaded
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({
      error: 'No files uploaded',
      message: 'At least one file must be uploaded'
    });
  }

  // Validate each uploaded file
  const uploadedFiles = req.files;
  const errors = [];

  // Check OR/CR copy
  if (uploadedFiles.orCrCopy && uploadedFiles.orCrCopy[0]) {
    const file = uploadedFiles.orCrCopy[0];
    if (file.size === 0) {
      errors.push('OR/CR copy file is empty');
    }
  }

  // Check driver's license copy
  if (uploadedFiles.driversLicenseCopy && uploadedFiles.driversLicenseCopy[0]) {
    const file = uploadedFiles.driversLicenseCopy[0];
    if (file.size === 0) {
      errors.push('Driver\'s license copy file is empty');
    }
  }

  // Check OR cashier receipt
  if (uploadedFiles.orCashier && uploadedFiles.orCashier[0]) {
    const file = uploadedFiles.orCashier[0];
    if (file.size === 0) {
      errors.push('OR cashier receipt file is empty');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'File validation failed',
      message: errors.join(', ')
    });
  }

  next();
};

module.exports = {
  uploadVehiclePassFiles,
  uploadSingleFile,
  handleUploadError,
  validateFileUpload
};
