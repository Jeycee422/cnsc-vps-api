# Vehicle Pass System API

A comprehensive REST API for managing vehicle passes with RFID integration, built with Node.js, Express, and MongoDB.

## Features

- **User Management**: Complete user registration and profile management
- **Vehicle Registration**: Vehicle information management and tracking
- **RFID Integration**: Ultra High Frequency RFID scanner support
- **Admin Dashboard**: Comprehensive admin interface for system management
- **Real-time Scanning**: Handle RFID scanner requests with automatic validation
- **Access Control**: Role-based authentication and authorization
- **Reporting**: Detailed scan reports and analytics
- **Security**: JWT authentication, input validation, and rate limiting

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Express-validator
- **Security**: Helmet, CORS, Rate limiting
- **RFID**: Ultra High Frequency RFID scanner integration

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cnsc-vps-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # MongoDB Configuration
   MONGODB_URI=mongodb://localhost:27017/vehicle_pass_system

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=24h

   # RFID Scanner Configuration
   RFID_SCANNER_ENDPOINT=/api/rfid/scan
   RFID_VALIDATION_TIMEOUT=5000

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Authentication

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/api/auth/register` | Register new user | Public |
| POST | `/api/auth/login` | User login | Public |
| GET | `/api/auth/me` | Get current user profile | Private |
| POST | `/api/auth/refresh` | Refresh JWT token | Private |
| POST | `/api/auth/change-password` | Change password | Private |
| POST | `/api/auth/logout` | Logout user | Private |

### RFID Operations

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/api/rfid/scan` | **Main RFID scanner endpoint** | Public |
| POST | `/api/rfid/assign` | Assign RFID tag to user | Admin |
| POST | `/api/rfid/unassign` | Unassign RFID tag from user | Admin |
| GET | `/api/rfid/scans/:userId` | Get user scan history | Private |
| GET | `/api/rfid/stats/:userId` | Get user scan statistics | Private |
| GET | `/api/rfid/recent` | Get recent scans | Admin |
| POST | `/api/rfid/validate` | Validate RFID tag | Admin |

### User Management

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/api/users/profile` | Get current user profile | Private |
| PUT | `/api/users/profile` | Update current user profile | Private |
| GET | `/api/users/:userId` | Get specific user | Private/Admin |
| POST | `/api/users/vehicles` | Register vehicle for user | Private |
| GET | `/api/users/vehicles` | Get user's vehicles | Private |
| GET | `/api/users/vehicles/:vehicleId` | Get specific vehicle | Private |
| PUT | `/api/users/vehicles/:vehicleId` | Update vehicle | Private |
| DELETE | `/api/users/vehicles/:vehicleId` | Delete vehicle | Private |

### Admin Operations

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/api/admin/users` | Get all users with filters | Admin |
| GET | `/api/admin/users/:userId` | Get specific user details | Admin |
| PUT | `/api/admin/users/:userId/approve` | Approve user registration | Admin |
| PUT | `/api/admin/users/:userId/reject` | Reject user registration | Admin |
| PUT | `/api/admin/users/:userId/activate-pass` | Activate vehicle pass | Admin |
| PUT | `/api/admin/users/:userId/suspend-pass` | Suspend vehicle pass | Admin |
| GET | `/api/admin/vehicles` | Get all vehicles | Admin |
| GET | `/api/admin/dashboard` | Get admin dashboard stats | Admin |
| GET | `/api/admin/reports/scans` | Get scan reports | Admin |

### Vehicle Management

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/api/vehicles` | Get all vehicles | Admin |
| GET | `/api/vehicles/:vehicleId` | Get specific vehicle | Private |
| PUT | `/api/vehicles/:vehicleId/assign-rfid` | Assign RFID to vehicle | Admin |
| PUT | `/api/vehicles/:vehicleId/unassign-rfid` | Unassign RFID from vehicle | Admin |
| PUT | `/api/vehicles/:vehicleId/activate` | Activate vehicle | Admin |
| PUT | `/api/vehicles/:vehicleId/suspend` | Suspend vehicle | Admin |
| GET | `/api/vehicles/search/plate/:plateNumber` | Search by plate number | Private |

## RFID Scanner Integration

### Main Scanner Endpoint: `/api/rfid/scan`

This is the primary endpoint for UHF RFID scanners to send scan data.

**Request Format:**
```json
{
  "tagId": "RFID_TAG_ID",
  "scannerId": "SCANNER_001",
  "scannerLocation": "Main Gate",
  "scannerType": "entry",
  "scanType": "entry",
  "direction": "in",
  "coordinates": {
    "latitude": 14.5995,
    "longitude": 120.9842
  },
  "systemStatus": "online",
  "batteryLevel": 85,
  "signalStrength": 90,
  "metadata": {
    "additional": "data"
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Access granted",
  "scanId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "user": {
    "id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "firstName": "John",
    "lastName": "Doe",
    "passNumber": "VP123456789",
    "passType": "student"
  },
  "vehicle": {
    "id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "plateNumber": "ABC123",
    "make": "Toyota",
    "model": "Camry",
    "color": "White"
  },
  "scanner": {
    "id": "SCANNER_001",
    "location": "Main Gate",
    "type": "entry"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "RFID tag not found",
  "scanId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## User Registration Flow

1. **User Registration**: User submits registration form
2. **Admin Approval**: Admin reviews and approves registration
3. **RFID Assignment**: Admin assigns RFID tag to user
4. **Registration Complete**: User status changes to "completed"
5. **Active Access**: User can now use RFID for access

## Database Models

### User Model
- Personal information (name, email, phone, address)
- Vehicle pass details (pass number, type, status, expiry)
- RFID information (tag ID, assignment status, scan history)
- Registration status and role-based access

### Vehicle Model
- Vehicle details (make, model, year, color, plate number)
- Registration and insurance information
- RFID tag association
- Status tracking

### RFIDScan Model
- Complete scan history with timestamps
- Scanner information and location
- User and vehicle associations
- Scan results and error tracking

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: User, Admin, and Super Admin roles
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Protection against abuse
- **CORS Configuration**: Cross-origin resource sharing
- **Helmet Security**: HTTP headers security
- **Password Hashing**: bcrypt password encryption

## Error Handling

The API provides comprehensive error handling with:
- HTTP status codes
- Descriptive error messages
- Validation error details
- Logging for debugging

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Deployment

1. **Production Environment Setup**
   ```bash
   NODE_ENV=production
   MONGODB_URI=your-production-mongodb-uri
   JWT_SECRET=your-production-jwt-secret
   ```

2. **PM2 Deployment**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "vps-api"
   pm2 save
   pm2 startup
   ```

3. **Docker Deployment**
   ```bash
   docker build -t vps-api .
   docker run -p 3000:3000 vps-api
   ```

## API Documentation

For detailed API documentation, refer to the individual route files or use tools like:
- Postman Collection
- Swagger/OpenAPI
- Insomnia

## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## License

This project is licensed under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

**Note**: This API is designed to handle high-frequency RFID scanning operations and includes comprehensive logging and monitoring capabilities for production deployment.
