require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const Email = 'system.admin@gmail.com'.toLowerCase().trim();

const createSystemAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const existing = await User.findOne({ email: Email });
    if (existing) {
      console.log('System admin already exists');
      process.exit(0);
    }

    const sysAdmin = new User({
      firstName: 'System',
      lastName: 'Administrator',
      email: Email,
      address: 'CNSC',
      phoneNumber: '09123456789',
      password: 'systemadmin1001!',
      role: 'system_admin'
    });

    await sysAdmin.save();
    console.log('System admin created successfully:', sysAdmin.email);
    process.exit(0);
  } catch (error) {
    console.error('Error creating system admin:', error);
    process.exit(1);
  }
};

createSystemAdmin();


