const multer = require('multer');
const path = require('path');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Enhanced file filter to include more document types
const fileFilter = (req, file, cb) => {
  // Allowed file types for vehicle pass documents
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    
    // Documents
    'application/pdf', // PDF documents
    'application/msword', // DOC documents
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX documents
    'text/plain', // TXT documents
    
    // Spreadsheets (optional)
    'application/vnd.ms-excel', // XLS
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  ];

  const allowedExtensions = [
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
    // Documents
    '.pdf', '.doc', '.docx', '.txt',
    // Spreadsheets
    '.xls', '.xlsx'
  ];

  // Check MIME type first
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Check file extension as fallback
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(
        `Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`
      ), false);
    }
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 4 // Maximum 4 files per request
  }
});

// Middleware for vehicle pass application file uploads
// Single OR and CR copies (no arrays)
const uploadVehiclePassFiles = upload.fields([
  { name: 'orCopy', maxCount: 1 },
  { name: 'crCopy', maxCount: 1 },
  { name: 'driversLicenseCopy', maxCount: 1 },
  { name: 'authLetter', maxCount: 1 },
  { name: 'deedOfSale', maxCount: 1 }
]);

// Middleware for single file uploads (for updates)
const uploadSingleFile = upload.single('file');

// Enhanced error handling middleware
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
        message: 'Maximum 4 files allowed per request'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected file field',
        message: 'Only orCopy, crCopy, driversLicenseCopy, authLetter, and deedOfSale fields are allowed'
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
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({
      error: 'No files uploaded',
      message: 'At least one file must be uploaded'
    });
  }

  const uploadedFiles = req.files;
  const errors = [];

  // Helper function to validate file
  const validateFileField = (fieldName, displayName) => {
    if (uploadedFiles[fieldName]) {
      const file = Array.isArray(uploadedFiles[fieldName]) ? uploadedFiles[fieldName][0] : uploadedFiles[fieldName];
      if (file.size === 0) {
        errors.push(`${displayName} file is empty`);
      }
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];
      if (!allowedExts.includes(ext)) {
        errors.push(`${displayName} has invalid file type: ${ext}`);
      }
    }
  };

  // Validate each file field
  validateFileField('orCopy', 'OR Copy');
  validateFileField('crCopy', 'CR Copy');
  validateFileField('driversLicenseCopy', 'Driver\'s License');
  validateFileField('authLetter', 'Authorization Letter');
  validateFileField('deedOfSale', 'Deed of Sale');

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