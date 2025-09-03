// src/routes/medicalRecords.js
const { Router } = require('express');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { authRequired } = require('../middleware/auth');

const r = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Initialize Azure Blob Service Client
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const containerName = process.env.AZURE_CONTAINER_NAME || 'medical-records';

/**
 * POST /medical-records/upload
 * Upload medical record to Azure Blob Storage
 * Requires authentication
 */
r.post('/upload', authRequired, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const userId = req.auth.userId;
    const file = req.file;
    
    // Generate unique filename
    const fileExtension = '.pdf';
    const fileName = `${userId}/${uuidv4()}${fileExtension}`;
    
    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Create container if it doesn't exist
    try {
      await containerClient.createIfNotExists({
        access: 'private'
      });
    } catch (error) {
      console.log('Container already exists or error creating:', error.message);
    }
    
    // Get blob client
    const blobClient = containerClient.getBlockBlobClient(fileName);
    
    // Upload file to Azure Blob Storage
    const uploadResponse = await blobClient.upload(file.buffer, file.size, {
      blobHTTPHeaders: {
        blobContentType: file.mimetype,
      },
      metadata: {
        originalName: file.originalname,
        userId: userId,
        uploadDate: new Date().toISOString(),
      }
    });

    // Return success response with file metadata
    res.status(200).json({
      success: true,
      fileId: fileName,
      originalName: file.originalname,
      size: file.size,
      uploadDate: new Date().toISOString(),
      blobUrl: blobClient.url,
      etag: uploadResponse.etag
    });

  } catch (error) {
    console.error('File upload error:', error);
    
    if (error.message === 'Only PDF files are allowed') {
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }
    
    res.status(500).json({ error: 'File upload failed' });
  }
});

/**
 * GET /medical-records/list
 * List all medical records for the authenticated user
 */
r.get('/list', authRequired, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    const files = [];
    
    // List blobs with the user's prefix
    for await (const blob of containerClient.listBlobsFlat({
      prefix: `${userId}/`
    })) {
      const blobClient = containerClient.getBlobClient(blob.name);
      const properties = await blobClient.getProperties();
      
      files.push({
        fileId: blob.name,
        originalName: properties.metadata?.originalName || 'Unknown',
        size: blob.properties.contentLength,
        uploadDate: properties.metadata?.uploadDate || blob.properties.lastModified.toISOString(),
        lastModified: blob.properties.lastModified.toISOString(),
        contentType: blob.properties.contentType,
      });
    }
    
    res.json({ files });
    
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * GET /medical-records/download/:userId/:filename
 * Download a specific medical record
 */
r.get('/download/:userId/:filename', authRequired, async (req, res) => {
  try {
    const authenticatedUserId = req.auth.userId;
    const requestedUserId = req.params.userId;
    const filename = req.params.filename;
    
    // Ensure user can only access their own files
    if (authenticatedUserId !== requestedUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const fileId = `${requestedUserId}/${filename}`;
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(fileId);
    
    // Check if blob exists
    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get blob properties for metadata
    const properties = await blobClient.getProperties();
    const originalName = properties.metadata?.originalName || 'download.pdf';
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.setHeader('Content-Length', properties.contentLength);
    
    // Stream the blob to response
    const downloadResponse = await blobClient.download();
    downloadResponse.readableStreamBody.pipe(res);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * DELETE /medical-records/delete/:userId/:filename
 * Delete a specific medical record
 */
r.delete('/delete/:userId/:filename', authRequired, async (req, res) => {
  try {
    const authenticatedUserId = req.auth.userId;
    const requestedUserId = req.params.userId;
    const filename = req.params.filename;
    
    // Ensure user can only delete their own files
    if (authenticatedUserId !== requestedUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const fileId = `${requestedUserId}/${filename}`;
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(fileId);
    
    // Check if blob exists
    const exists = await blobClient.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete the blob
    await blobClient.delete();
    
    res.json({ success: true, message: 'File deleted successfully' });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = r;