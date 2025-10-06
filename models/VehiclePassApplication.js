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

  // File attachments - UPDATED to match multer configuration
  attachments: {
    orCrCopy: [{
      fileId: { type: mongoose.Schema.Types.ObjectId },
      fileName: { type: String },
      uploadedAt: { type: Date, default: Date.now },
      fileSize: { type: Number },
      mimeType: { type: String },
      fileType: { type: String, default: 'orCrCopy' } // For easier identification
    }],
    driversLicenseCopy: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      fileName: { type: String },
      uploadedAt: { type: Date, default: Date.now },
      fileSize: { type: Number },
      mimeType: { type: String }
    },
    authLetter: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      fileName: { type: String },
      uploadedAt: { type: Date, default: Date.now },
      fileSize: { type: Number },
      mimeType: { type: String }
    },
    deedOfSale: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      fileName: { type: String },
      uploadedAt: { type: Date, default: Date.now },
      fileSize: { type: Number },
      mimeType: { type: String }
    }
  }
}, { timestamps: true });

// Helper method to get all attachments as array
vehiclePassApplicationSchema.methods.getAllAttachments = function() {
  const attachments = [];
  
  if (this.attachments.orCrCopy && this.attachments.orCrCopy.length > 0) {
    this.attachments.orCrCopy.forEach((file, index) => {
      attachments.push({
        ...file.toObject(),
        documentType: 'orCrCopy',
        displayName: `OR/CR Copy ${index + 1}`
      });
    });
  }
  
  if (this.attachments.driversLicenseCopy && this.attachments.driversLicenseCopy.fileId) {
    attachments.push({
      ...this.attachments.driversLicenseCopy.toObject(),
      documentType: 'driversLicenseCopy',
      displayName: 'Driver\'s License Copy'
    });
  }
  
  if (this.attachments.authLetter && this.attachments.authLetter.fileId) {
    attachments.push({
      ...this.attachments.authLetter.toObject(),
      documentType: 'authLetter',
      displayName: 'Authorization Letter'
    });
  }
  
  if (this.attachments.deedOfSale && this.attachments.deedOfSale.fileId) {
    attachments.push({
      ...this.attachments.deedOfSale.toObject(),
      documentType: 'deedOfSale',
      displayName: 'Deed of Sale'
    });
  }
  
  return attachments;
};

// Virtual for checking if all required documents are uploaded
vehiclePassApplicationSchema.virtual('hasRequiredDocuments').get(function() {
  const hasOrCr = this.attachments.orCrCopy && this.attachments.orCrCopy.length > 0;
  const hasLicense = this.attachments.driversLicenseCopy && this.attachments.driversLicenseCopy.fileId;
  
  // Basic required documents
  return hasOrCr && hasLicense;
});

module.exports = mongoose.model('VehiclePassApplication', vehiclePassApplicationSchema);