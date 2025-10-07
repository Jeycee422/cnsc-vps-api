const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');

class GridFSStorageService {
  constructor() {
    this.bucket = null;
    this.bucketName = process.env.GRIDFS_BUCKET_NAME || 'uploads';
    this.initializeBucket();
  }

  /**
   * Initialize GridFSBucket connection
   */
  initializeBucket() {
    const setupBucket = () => {
      this.bucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: this.bucketName
      });
    };

    if (mongoose.connection.readyState === 1) {
      setupBucket();
    } else {
      mongoose.connection.once('open', setupBucket);
    }
  }

  /**
   * Generate a unique filename to prevent conflicts
   * @param {string} originalName - Original filename
   * @param {string} userId - User ID for organization
   * @param {string} fileType - Type of file (orCopy, crCopy, driversLicenseCopy, ...)
   * @returns {string} - Unique filename
   */
  generateUniqueFileName(originalName, userId, fileType) {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    
    return `vehicle-passes/${userId}/${fileType}/${timestamp}-${randomString}-${baseName}${extension}`;
  }

  /**
   * Upload file to GridFS using native GridFSBucket with streaming
   * @param {Buffer} fileBuffer - File buffer (from multer memory storage)
   * @param {string} fileName - Generated filename
   * @param {string} mimeType - File MIME type
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - Upload result with file ID and metadata
   */
  async uploadFile(fileBuffer, fileName, mimeType, metadata = {}) {
    return new Promise((resolve, reject) => {
      if (!this.bucket) {
        return reject(new Error('GridFS bucket not initialized'));
      }

      const readable = new Readable({ read() {} });
      readable.push(fileBuffer);
      readable.push(null);

      const uploadStream = this.bucket.openUploadStream(fileName, {
        contentType: mimeType,
        metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'vehicle-pass-system'
        }
      });

      uploadStream.on('error', (error) => {
        console.error('GridFSBucket upload error:', error);
        reject(new Error(`Failed to upload file: ${error.message}`));
      });

      uploadStream.on('finish', (file) => {
        resolve({
          success: true,
          fileId: file._id,
          fileName: file.filename || fileName,
          fileSize: file.length || fileBuffer.length,
          mimeType: file.contentType || mimeType,
          uploadedAt: new Date()
        });
      });

      readable.pipe(uploadStream);
    });
  }

  /**
   * Get file stream from GridFS
   * @param {string} fileName - GridFS filename
   * @returns {Promise<Object>} - File stream and metadata
   */
  async getFile(fileName) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.bucket) {
          return reject(new Error('GridFS bucket not initialized'));
        }
        const filesCol = mongoose.connection.db.collection(`${this.bucketName}.files`);
        const file = await filesCol.findOne({ filename: fileName });
        if (!file) {
          return reject(new Error('File not found'));
        }
        const readStream = this.bucket.openDownloadStreamByName(fileName);
        resolve({ stream: readStream, file });
      } catch (err) {
        reject(new Error(`Failed to get file: ${err.message}`));
      }
    });
  }

  /**
   * Get file by ID from GridFS
   * @param {string} fileId - GridFS file ID
   * @returns {Promise<Object>} - File stream and metadata
   */
  async getFileById(fileId) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.bucket) {
          return reject(new Error('GridFS bucket not initialized'));
        }
        const id = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
        const filesCol = mongoose.connection.db.collection(`${this.bucketName}.files`);
        const file = await filesCol.findOne({ _id: id });
        if (!file) {
          return reject(new Error('File not found'));
        }
        const readStream = this.bucket.openDownloadStream(id);
        resolve({ stream: readStream, file });
      } catch (err) {
        reject(new Error(`Failed to get file by id: ${err.message}`));
      }
    });
  }

  /**
   * Delete file from GridFS
   * @param {string} fileName - GridFS filename
   * @returns {Promise<boolean>} - Success status
   */
  async deleteFile(fileName) {
    try {
      if (!this.bucket) {
        throw new Error('GridFS bucket not initialized');
      }
      const filesCol = mongoose.connection.db.collection(`${this.bucketName}.files`);
      const file = await filesCol.findOne({ filename: fileName });
      if (!file) {
        return true; // already absent
      }
      await this.bucket.delete(file._id);
      return true;
    } catch (err) {
      console.error('GridFSBucket delete error:', err);
      throw new Error(`Failed to delete file: ${err.message}`);
    }
  }

  /**
   * Delete file by ID from GridFS
   * @param {string} fileId - GridFS file ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteFileById(fileId) {
    try {
      if (!this.bucket) {
        throw new Error('GridFS bucket not initialized');
      }
      const id = typeof fileId === 'string' ? new ObjectId(fileId) : fileId;
      await this.bucket.delete(id);
      return true;
    } catch (err) {
      console.error('GridFSBucket delete error:', err);
      throw new Error(`Failed to delete file: ${err.message}`);
    }
  }

  /**
   * Check if file exists in GridFS
   * @param {string} fileName - GridFS filename
   * @returns {Promise<boolean>} - File existence status
   */
  async fileExists(fileName) {
    if (!this.bucket) {
      throw new Error('GridFS bucket not initialized');
    }
    const filesCol = mongoose.connection.db.collection(`${this.bucketName}.files`);
    const file = await filesCol.findOne({ filename: fileName });
    return !!file;
  }

  /**
   * Get file metadata from GridFS
   * @param {string} fileName - GridFS filename
   * @returns {Promise<Object>} - File metadata
   */
  async getFileMetadata(fileName) {
    try {
      if (!this.bucket) {
        throw new Error('GridFS bucket not initialized');
      }
      const filesCol = mongoose.connection.db.collection(`${this.bucketName}.files`);
      const file = await filesCol.findOne({ filename: fileName });
      if (!file) {
        throw new Error('File not found');
      }
      return {
        fileName: file.filename,
        fileSize: file.length,
        mimeType: file.contentType,
        uploadDate: file.uploadDate,
        metadata: file.metadata
      };
    } catch (err) {
      console.error('GridFSBucket metadata error:', err);
      throw new Error(`Failed to get file metadata: ${err.message}`);
    }
  }

  /**
   * List files in GridFS with optional filtering
   * @param {Object} filter - MongoDB filter object
   * @returns {Promise<Array>} - List of files
   */
  async listFiles(filter = {}) {
    if (!this.bucket) {
      throw new Error('GridFS bucket not initialized');
    }
    const filesCol = mongoose.connection.db.collection(`${this.bucketName}.files`);
    const files = await filesCol.find(filter).toArray();
    return files;
  }
}

module.exports = new GridFSStorageService();
