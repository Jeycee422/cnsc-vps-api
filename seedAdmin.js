require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User'); // adjust path if needed

const Email = 'gso.admin@gmail.com'.toLowerCase().trim();

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const existingAdmin = await User.findOne({ email: Email });
    if (existingAdmin) {
      console.log('Admin already exists');
      process.exit(0);
    }

    const admin = new User({
      firstName: 'Jogee Vern Katherine',
      lastName: 'Bacerdo',
      email: Email,
      address: 'CNSC',
      phoneNumber: '09123456789',
      password: 'gsoadmin1001!', // <-- will be hashed by your schema middleware
      role: 'admin'
    });

    await admin.save();
    console.log('Admin created successfully:', admin.email);
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  }
};

createAdmin();
