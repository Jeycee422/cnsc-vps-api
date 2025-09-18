const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');

describe('Vehicle Pass System API', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/vps_test');
  });

  afterAll(async () => {
    // Close database connection
    await mongoose.connection.close();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phoneNumber: '+1234567890',
        dateOfBirth: '1990-01-01',
        address: {
          street: '123 Main St',
          city: 'Test City',
          state: 'Test State',
          zipCode: '12345',
          country: 'Philippines'
        },
        vehiclePass: {
          passType: 'student',
          expiryDate: '2025-12-31'
        },
        password: 'TestPass123!'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('registrationStatus', 'incomplete');
    });

    it('should login user', async () => {
      const loginData = {
        email: 'john.doe@example.com',
        password: 'TestPass123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });
  });

  describe('RFID Operations', () => {
    it('should handle RFID scan request', async () => {
      const scanData = {
        tagId: 'TEST_RFID_001',
        scannerId: 'SCANNER_001',
        scannerLocation: 'Test Gate',
        scannerType: 'entry',
        scanType: 'entry',
        direction: 'in',
        responseTime: 100
      };

      const response = await request(app)
        .post('/api/rfid/scan')
        .send(scanData)
        .expect(403); // Should be denied since RFID tag is not assigned

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('scanId');
    });
  });
});
