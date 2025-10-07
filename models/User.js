const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Personal Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  middleName: {
    type: String,
    trim: true,
    maxlength: [50, 'Middle name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },

  // Affiliation determines default pass type
  affiliation: {
    type: String,
    enum: ['student', 'personnel', 'others'],
    default: 'others'
  },

// Authentication
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long']
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'super_admin', 'security_guard', 'system_admin'],
    default: 'user'
  },

// Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
userSchema.index({ email: 1 });

// Pre-findOneAndUpdate middleware to hash password during updates
userSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  
  // Check if password is being updated
  if (update && update.password) {
    try {
      console.log('🔐 Hashing password in findOneAndUpdate hook');
      const salt = await bcrypt.genSalt(12);
      update.password = await bcrypt.hash(update.password, salt);
      this.setUpdate(update);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// In your User model - update the comparePassword method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    console.log('🔐 Comparing passwords for user:', this.email);
    console.log('📝 Candidate password:', candidatePassword);
    console.log('🗄️ Stored password hash:', this.password ? 'Exists' : 'Missing');
    console.log('🔍 Hash length:', this.password?.length);
    
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    console.log('✅ Password match result:', isMatch);
    
    return isMatch;
  } catch (error) {
    console.error('❌ Password comparison error:', error);
    return false;
  }
};


// Virtual for full name
userSchema.virtual('fullName').get(function() {
  const middleName = this.middleName ? ` ${this.middleName}` : '';
  return `${this.firstName}${middleName} ${this.lastName}`;
});

// Ensure virtual fields are serialized
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
