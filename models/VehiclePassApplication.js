const mongoose = require('mongoose');

const vehiclePassApplicationSchema = new mongoose.Schema({
  applicant: {
    familyName: { type: String, required: true },
    givenName: { type: String, required: true },
    middleName: { type: String }
  },
  homeAddress: { type: String, required: true },
  
  schoolAffiliation: { type: String, enum: ['student', 'personnel', 'other'], required: true },
  otherAffiliation: { type: String }, // if "other"

  idNumber: { type: String, required: true },
  contactNumber: { type: String },

  // Employment info (for personnel)
  employmentStatus: { type: String, enum: ['permanent', 'temporary', 'casual', 'job_order', 'n/a'], default: 'n/a' },

  // Other applicants
  company: String,
  purpose: String,

  // Parent/guardian (if student)
  guardianName: String,
  guardianAddress: String,

  vehicleUserType: { type: String, enum: ['owner', 'driver', 'passenger'], required: true },

  vehicleInfo: {
    type: {
      type: String,
      enum: ['motorcycle', 'car', 'suv', 'tricycle', 'double_cab', 'single_cab', 'heavy_truck', 'heavy_equipment', 'bicycle', 'e_vehicle'],
      required: true
    },
    plateNumber: { type: String, required: true },
    orNumber: { type: String, required: true },
    crNumber: { type: String, required: true },
    driverName: { type: String },
    driverLicense: { type: String }
  },

  // Status tracking
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'completed', 'rejected'], 
    default: 'pending' 
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who checked it
  linkedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // applicant user (if online)
  
  // Payment and RFID tracking
  paymentInfo: {
    paidAt: { type: Date },
    orReceiptNumber: { type: String },
    amount: { type: Number },
    cashierName: { type: String }
  },
  
  rfidInfo: {
    tagId: { type: String },
    assignedAt: { type: Date },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: false },
    validUntil: { type: Date }
  },

  // File attachments
  attachments: {
    orCrCopy: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      fileName: { type: String },
      uploadedAt: { type: Date },
      fileSize: { type: Number },
      mimeType: { type: String }
    },
    driversLicenseCopy: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      fileName: { type: String },
      uploadedAt: { type: Date },
      fileSize: { type: Number },
      mimeType: { type: String }
    },
    orCashier: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      fileName: { type: String },
      uploadedAt: { type: Date },
      fileSize: { type: Number },
      mimeType: { type: String }
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('VehiclePassApplication', vehiclePassApplicationSchema);
