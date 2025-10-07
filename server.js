const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
// Trust the first proxy (required on platforms like Render/Heroku to respect X-Forwarded-* headers)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const vehiclePassRoutes = require('./routes/vehicle-passes');
const walkInRoutes = require('./routes/walkins');
const rfidRoutes = require('./routes/rfid');
const adminRoutes = require('./routes/admin');
const systemAdminRoutes = require('./routes/system-admin');

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/plain' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vehicle_pass_system', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// --- Realtime: Socket.IO auth and rooms ---
// Clients should pass { auth: { token: 'Bearer <JWT>' } } when connecting
io.on('connection', async (socket) => {
  try {
    const authHeader = socket.handshake.auth && socket.handshake.auth.token;
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : authHeader; // allow raw token too

    if (!token) {
      socket.emit('error', { error: 'Authentication required for realtime' });
      return socket.disconnect(true);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Join per-user room
    if (decoded && decoded.userId) {
      socket.join(`user:${decoded.userId}`);
    }

    // Join admins room if role is admin/super_admin
    if (decoded && (decoded.role === 'admin' || decoded.role === 'super_admin')) {
      socket.join('admins');
    }

    socket.emit('realtime:connected', { rooms: Array.from(socket.rooms) });
  } catch (err) {
    socket.emit('error', { error: 'Invalid or expired token for realtime' });
    return socket.disconnect(true);
  }
});

// --- Realtime: MongoDB Change Streams for VehiclePassApplication ---
const VehiclePassApplication = require('./models/VehiclePassApplication');
mongoose.connection.once('open', () => {
  try {
    const pipeline = [
      { $match: { operationType: { $in: ['insert', 'update'] } } }
    ];

    const changeStream = VehiclePassApplication.watch(pipeline, { fullDocument: 'updateLookup' });

    changeStream.on('change', (change) => {
      const doc = change.fullDocument;

      if (change.operationType === 'insert') {
        io.to('admins').emit('vehiclePass:new', { application: doc });
      }

      if (change.operationType === 'update') {
        io.to('admins').emit('vehiclePass:updated', { application: doc });

        const updatedFields = (change.updateDescription && change.updateDescription.updatedFields) || {};
        if (Object.prototype.hasOwnProperty.call(updatedFields, 'status')) {
          const linkedUserId = doc && doc.linkedUser && doc.linkedUser.toString();
          if (linkedUserId) {
            io.to(`user:${linkedUserId}`).emit('vehiclePass:statusChanged', {
              applicationId: doc._id,
              status: doc.status
            });
          }
        }
      }
    });

    changeStream.on('error', (err) => {
      console.error('Change stream error:', err);
      console.error('Ensure MongoDB is running as a replica set for change streams.');
    });
  } catch (err) {
    console.error('Failed to initialize change stream:', err);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vehicle-passes', vehiclePassRoutes);
app.use('/api/walkins', walkInRoutes);
app.use('/api/rfid', rfidRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/system-admin', systemAdminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint for platform health checks (GET/HEAD /)
app.get('/', (req, res) => {
  res.status(200).send('OK');
});
app.head('/', (req, res) => {
  res.sendStatus(200);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
