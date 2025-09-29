const express = require('express');
const VehiclePassApplication = require('../models/VehiclePassApplication');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/walkins/application
// @desc    Create walk-in vehicle pass application with manual input (admin only)
// @access  Private (Admin)
router.post('/application', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      familyName,
      givenName,
      middleName,
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
      vehicleType,
      plateNumber,
      orNumber,
      crNumber,
      driverName,
      driverLicense
    } = req.body;

    if (!familyName || !givenName || !homeAddress || !schoolAffiliation || !idNumber || 
        !vehicleUserType || !vehicleType || !plateNumber || !orNumber || 
        !crNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validAffiliations = ['student', 'personnel', 'other'];
    if (!validAffiliations.includes(schoolAffiliation)) {
      return res.status(400).json({ error: 'Invalid school affiliation' });
    }

    const validVehicleUserTypes = ['owner', 'driver', 'passenger'];
    if (!validVehicleUserTypes.includes(vehicleUserType)) {
      return res.status(400).json({ error: 'Invalid vehicle user type' });
    }

    // Ensure no existing walk-in for this plate number
    const existingForVehicle = await VehiclePassApplication.findOne({ 'vehicleInfo.plateNumber': plateNumber.toUpperCase() });
    if (existingForVehicle) {
      return res.status(400).json({ error: 'This vehicle already has a walk-in application' });
    }

    // Check if any user has already registered a vehicle with the same plate number, OR number, or CR number
    const duplicateVehicle = await VehiclePassApplication.findOne({
      $or: [
        { 'vehicleInfo.plateNumber': plateNumber.toUpperCase() },
        { 'vehicleInfo.orNumber': orNumber },
        { 'vehicleInfo.crNumber': crNumber }
      ]
    });

    if (duplicateVehicle) {
      const duplicateFields = [];
      if (duplicateVehicle.vehicleInfo.plateNumber === plateNumber.toUpperCase()) {
        duplicateFields.push('plate number');
      }
      if (duplicateVehicle.vehicleInfo.orNumber === orNumber) {
        duplicateFields.push('OR number');
      }
      if (duplicateVehicle.vehicleInfo.crNumber === crNumber) {
        duplicateFields.push('CR number');
      }
      
      return res.status(400).json({ 
        error: `Vehicle with the same ${duplicateFields.join(', ')} has already been registered` 
      });
    }

    const app = new VehiclePassApplication({
      applicant: {
        familyName,
        givenName,
        middleName
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
        type: vehicleType.toString().toLowerCase().replace(/\s+/g, '_'),
        plateNumber: plateNumber.toUpperCase(),
        orNumber,
        crNumber,
        driverName,
        driverLicense
      },
      status: 'pending'
      // reviewedBy will be set by admin actions; linkedUser omitted for walk-ins
    });

    await app.save();

    res.status(201).json({
      message: 'Walk-in application created',
      application: app
    });
  } catch (error) {
    console.error('Walk-in application error:', error);
    res.status(500).json({ error: 'Failed to create walk-in application', message: error.message });
  }
});

module.exports = router;


