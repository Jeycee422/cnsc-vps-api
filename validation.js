const { body, param, query, validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Get the first validation error message for a more user-friendly response
    const firstError = errors.array()[0];
    return res.status(400).json({
      error: firstError.msg,
      details: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Validation rules for user registration
const validateUserRegistration = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('phoneNumber')
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number'),
  
  // Note: dateOfBirth field removed from User model
  // body('dateOfBirth')
  //   .isISO8601()
  //   .withMessage('Please provide a valid date of birth'),
  
  // Note: Address is now a simple string field, not an object
  body('address')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  
  // Note: Vehicle pass validation removed from registration
  // Vehicle pass will be created during vehicle pass application process
  
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  handleValidationErrors
];

// Validation rules for user login
const validateUserLogin = [
  body('email')
    .isEmail()
    // .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

// Validation rules for vehicle registration
const validateVehicleRegistration = [
  body('plateNumber')
    .trim()
    .isLength({ min: 5, max: 20 })
    .withMessage('Plate number must be between 5 and 20 characters'),
  
  body('vehicleType')
    .isIn(['Motorcycle', 'Car', 'SUV', 'Tricycle', 'Double/Single Cab', 'Heavy Truck', 'Heavy Equipment', 'Bicycle', 'E-Vehicle'])
    .withMessage('Invalid vehicle type'),
  
  body('orNumber')
    .trim()
    .notEmpty()
    .withMessage('O.R. Number is required'),
  
  body('crNumber')
    .trim()
    .notEmpty()
    .withMessage('C.R. Number is required'),
  
  handleValidationErrors
];

// Validation rules for RFID scan
const validateRFIDScan = [
  body('tagId')
    .trim()
    .notEmpty()
    .withMessage('RFID tag ID is required'),
  
  body('scanType')
    .optional()
    .isIn(['entry', 'exit', 'checkpoint', 'registration', 'validation'])
    .withMessage('Invalid scan type'),
  
  body('direction')
    .optional()
    .isIn(['in', 'out', 'both'])
    .withMessage('Invalid direction'),
  
  handleValidationErrors
];

// Validation rules for RFID tag assignment
const validateRFIDAssignment = [
  body('tagId')
    .trim()
    .notEmpty()
    .withMessage('RFID tag ID is required'),
  
  body('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  
  handleValidationErrors
];

// Validation rules for user ID parameter
const validateUserId = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  
  handleValidationErrors
];

// Validation rules for vehicle ID parameter
const validateVehicleId = [
  param('vehicleId')
    .isMongoId()
    .withMessage('Invalid vehicle ID'),
  
  handleValidationErrors
];

// Validation rules for pagination
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

// Validation rules for date range
const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (req.query.startDate && value) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(value);
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),
  
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateVehicleRegistration,
  validateRFIDScan,
  validateRFIDAssignment,
  validateUserId,
  validateVehicleId,
  validatePagination,
  validateDateRange
};
