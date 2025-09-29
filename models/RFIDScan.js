const mongoose = require('mongoose');

const rfidScanSchema = new mongoose.Schema({
  // RFID Tag Information
  tagId: {
    type: String,
    required: [true, 'RFID tag ID is required'],
    trim: true
  },

  // Scanner Information
  scannerId: {
    type: String,
    trim: true
  },
  scannerLocation: {
    type: String,
    trim: true
  },
  scannerType: {
    type: String,
    enum: ['entry', 'exit', 'checkpoint', 'registration']
  },

  // User and Vehicle Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehiclePassApplication'
  },

  // Scan Details
  scanType: {
    type: String,
    enum: ['entry', 'exit', 'checkpoint', 'registration', 'validation'],
    required: true
  },
  scanResult: {
    type: String,
    enum: ['success', 'denied', 'error', 'unknown'],
    required: true
  },
  scanMessage: {
    type: String,
    trim: true
  },

  // Location and Direction
  direction: {
    type: String,
    enum: ['in', 'out', 'both'],
    required: true
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },

  // Timing Information
  scanTimestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  responseTime: {
    type: Number, // in milliseconds
    required: true
  },

  // System Information
  systemStatus: {
    type: String,
    enum: ['online', 'offline', 'maintenance'],
    default: 'online'
  },
  batteryLevel: {
    type: Number,
    min: 0,
    max: 100
  },
  signalStrength: {
    type: Number,
    min: 0,
    max: 100
  },

  // Additional Data
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Error Information (if any)
  errorCode: {
    type: String,
    trim: true
  },
  errorMessage: {
    type: String,
    trim: true
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
rfidScanSchema.index({ tagId: 1 });
rfidScanSchema.index({ user: 1 });
rfidScanSchema.index({ vehicle: 1 });
rfidScanSchema.index({ scannerId: 1 });
rfidScanSchema.index({ scanTimestamp: -1 });
rfidScanSchema.index({ scanType: 1 });
rfidScanSchema.index({ scanResult: 1 });
rfidScanSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Compound indexes for common queries
rfidScanSchema.index({ user: 1, scanTimestamp: -1 });
rfidScanSchema.index({ tagId: 1, scanTimestamp: -1 });
rfidScanSchema.index({ scannerId: 1, scanTimestamp: -1 });

// TTL index to automatically delete old records (optional)
// rfidScanSchema.index({ scanTimestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Static method to get scan statistics
rfidScanSchema.statics.getScanStats = async function(userId, startDate, endDate) {
  const matchStage = {
    user: mongoose.Types.ObjectId(userId)
  };

  if (startDate && endDate) {
    matchStage.scanTimestamp = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  return await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          scanType: '$scanType',
          scanResult: '$scanResult'
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' }
      }
    },
    {
      $group: {
        _id: '$_id.scanType',
        results: {
          $push: {
            result: '$_id.scanResult',
            count: '$count',
            avgResponseTime: '$avgResponseTime'
          }
        },
        totalScans: { $sum: '$count' }
      }
    }
  ]);
};

// Static method to get recent scans for a user
rfidScanSchema.statics.getRecentScans = async function(userId, limit = 10) {
  return await this.find({ user: userId })
    .sort({ scanTimestamp: -1 })
    .limit(limit)
    .populate('user', 'firstName lastName email')
    .populate('vehicle', 'vehicleInfo.plateNumber vehicleInfo.type');
};

// Static method to validate RFID tag
rfidScanSchema.statics.validateTag = async function(tagId) {
  // Note: RFID functionality has been removed from User model
  // This method is kept for backward compatibility but will always return invalid
  return {
    isValid: false,
    message: 'RFID functionality has been removed from the system',
    user: null
  };
};

module.exports = mongoose.model('RFIDScan', rfidScanSchema);
