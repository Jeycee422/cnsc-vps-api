const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = {
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
}; // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL // Your Firebase Realtime Database URL
});

const db = admin.database();

class FirebaseService {
  // Add notification for a specific user
  static async addUserNotification(userId, notification) {
    try {
      const notificationsRef = db.ref(`notifications/${userId}`);
      const newNotificationRef = notificationsRef.push();
      
      const notificationData = {
        id: newNotificationRef.key,
        userId: userId,
        title: notification.title,
        message: notification.message,
        type: notification.type || 'info',
        data: notification.data || {},
        read: false,
        createdAt: admin.database.ServerValue.TIMESTAMP,
        expiresAt: notification.expiresAt || null
      };

      await newNotificationRef.set(notificationData);
      return newNotificationRef.key;
    } catch (error) {
      console.error('Error adding Firebase notification:', error);
      throw error;
    }
  }
}

module.exports = FirebaseService;