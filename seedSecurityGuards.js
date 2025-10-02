// seedSecurityGuards.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const createSecurityGuards = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Security Guard Users
    const securityGuards = [
      {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'security.guard1@cnsc.edu.ph',
        address: 'CNSC Main Gate',
        phoneNumber: '09123456780',
        password: 'security123!',
        role: 'security_guard',
        affiliation: 'personnel'
      },
      {
        firstName: 'Maria',
        lastName: 'Santos',
        email: 'security.guard2@cnsc.edu.ph',
        address: 'CNSC Back Gate',
        phoneNumber: '09123456781',
        password: 'security123!',
        role: 'security_guard',
        affiliation: 'personnel'
      },
      {
        firstName: 'Pedro',
        lastName: 'Reyes',
        email: 'security.guard3@cnsc.edu.ph',
        address: 'CNSC Parking Area',
        phoneNumber: '09123456782',
        password: 'security123!',
        role: 'security_guard',
        affiliation: 'personnel'
      },
      {
        firstName: 'Gate',
        lastName: 'Guard Alpha',
        email: 'guard.alpha@cnsc.edu.ph',
        address: 'CNSC Main Gate',
        phoneNumber: '09120000001',
        password: 'guardpass1!',
        role: 'security_guard',
        affiliation: 'personnel'
      },
      {
        firstName: 'Campus',
        lastName: 'Guard Bravo',
        email: 'guard.bravo@cnsc.edu.ph',
        address: 'CNSC Campus',
        phoneNumber: '09120000002',
        password: 'guardpass2!',
        role: 'security_guard',
        affiliation: 'personnel'
      }
    ];

    let createdCount = 0;
    let existingCount = 0;

    console.log('Starting Security Guard seeder...\n');

    for (const guardData of securityGuards) {
      const existingGuard = await User.findOne({ email: guardData.email });
      
      if (!existingGuard) {
        const guard = new User(guardData);
        await guard.save();
        console.log('✅ Security Guard created:', guard.email);
        createdCount++;
      } else {
        console.log('ℹ️ Security Guard already exists:', guardData.email);
        existingCount++;
      }
    }

    console.log('\n=================================');
    console.log('🎉 SECURITY GUARD SEEDER COMPLETED!');
    console.log('=================================');
    console.log(`✅ New guards created: ${createdCount}`);
    console.log(`ℹ️ Existing guards: ${existingCount}`);
    console.log(`📊 Total processed: ${securityGuards.length}`);
    console.log('=================================\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating security guards:', error);
    process.exit(1);
  }
};

createSecurityGuards();