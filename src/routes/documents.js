// src/routes/documents.js
const { Router } = require('express');
const { prisma } = require('../db');
const { authRequired } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { AzureBlobService } = require('../config/azure');

const router = Router();
const azureBlobService = new AzureBlobService();

// Initialize Azure container on startup
azureBlobService.initializeContainer().catch(console.error);

/**
 * POST /documents/upload-request
 * Patient requests permission to upload a medical document
 * Body: { originalFileName, fileSize, mimeType }
 */
// src/routes/documents.js
router.post('/upload-request', authRequired, requireRole('patient'), async (req, res) => {
  try {
    console.log('Upload request received:', req.body);
    
    const { originalFileName, fileSize, mimeType } = req.body;
    // const patientId = req.auth.id;
    
    // Validation
    if (!originalFileName || !fileSize || !mimeType) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (mimeType !== 'application/pdf') {
      console.log('Invalid file type:', mimeType);
      return res.status(400).json({ error: 'Only PDF files are allowed' });
    }
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileSize > maxSize) {
      console.log('File too large:', fileSize);
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
    }

    // Get patient record
    // const patient = await prisma.user.findUnique({
    //   // where: { userId: req.auth.userId }
    //   where: { id: patientId }
    // });

    const patient = await prisma.patient.findUnique({
      where: { userId: req.auth.userId }
    });
    
    if (!patient) {
      console.log('Patient not found for user ID:', req.auth.userId);
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const patientId = patient.id;

    // Generate unique blob name
    const blobName = azureBlobService.generateBlobName(patientId, originalFileName);
    console.log('Generated blob name:', blobName);
    
    // Generate presigned upload URL
    const uploadUrl = azureBlobService.generateUploadUrl(blobName, 15); // 15 minutes
    console.log('Generated upload URL:', uploadUrl);
    
    // Create pending document record
    const document = await prisma.medicalDocument.create({
      data: {
        patientId: patientId,
        originalFileName,
        fileName: blobName,
        fileSize,
        mimeType,
        blobPath: blobName
      }
    });

    console.log('Document record created:', document.id);

    res.json({
      documentId: document.id,
      uploadUrl,
      blobName,
      expiresIn: 15 * 60 // seconds
    });

  } catch (error) {
    console.error('Upload request failed:', error);
    res.status(500).json({ 
      error: 'Failed to generate upload URL',
      details: error.message 
    });
  }
});

/**
 * POST /documents/:documentId/confirm
 * Patient confirms successful upload to Azure Blob
 */
router.post('/:documentId/confirm', authRequired, requireRole('patient'), async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Get patient record
    // const patient = await prisma.patient.findUnique({
    //   where: { userId: req.auth.userId }
    // });
    const patient = await prisma.patient.findUnique({
      where: { userId: req.auth.userId }
    });
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const patientId = patient.id;

    // Find the document
    const document = await prisma.medicalDocument.findFirst({
      where: {
        id: documentId,
        patientId: patient.id
      }
    });

    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Verify the blob exists in Azure
    const blobExists = await azureBlobService.checkBlobExists(document.blobPath);
    
    if (!blobExists) {
      // Clean up database record if blob doesn't exist
      await prisma.medicalDocument.delete({
        where: { id: documentId }
      });
      return res.status(400).json({ error: 'Upload verification failed' });
    }

    res.json({ 
      success: true,
      document: {
        id: document.id,
        originalFileName: document.originalFileName,
        fileSize: document.fileSize,
        uploadDate: document.uploadDate
      }
    });

  } catch (error) {
    console.error('Upload confirmation failed:', error);
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
});

/**
 * GET /documents/my-documents
 * Patient gets their own medical documents
 */
router.get('/my-documents', authRequired, requireRole('patient'), async (req, res) => {
  try {
    // Get patient record
    // const patient = await prisma.patient.findUnique({
    //   where: { userId: req.auth.userId }
    // });

    const patient = await prisma.patient.findUnique({
      where: { userId: req.auth.userId }
    });
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }

    const patientId = patient.id;

    const documents = await prisma.medicalDocument.findMany({
      where: { patientId: patient.id },
      orderBy: { uploadDate: 'desc' },
      select: {
        id: true,
        originalFileName: true,
        fileSize: true,
        uploadDate: true,
        mimeType: true
      }
    });

    res.json({ documents });

  } catch (error) {
    console.error('Failed to fetch documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * GET /documents/patient/:patientId
 * Provider gets medical documents for a specific patient
 */
// router.get('/patient/:patientId', authRequired, requireRole('provider'), async (req, res) => {
//   try {
//     const { patientId } = req.params;

//     console.log('Provider requesting documents for patient:', patientId);
//     console.log('Provider user ID:', req.auth.userId);

//     // const patient = await prisma.patient.findUnique({
//     //   where: { userId: req.auth.userId }
//     // });
    
//     // Verify patient exists
//     // const patient = await prisma.patient.findUnique({
//     //   where: { userId: patientId },
//     //   include: {
//     //     user: {
//     //       select: { name: true, email: true }
//     //     }
//     //   }
//     // });

//     const patient = await prisma.patient.findUnique({
//       where: { id: patientId }, 
//       include: {
//         user: {
//           select: { name: true, email: true }
//         }
//       }
//     });
    
    
//     if (!patient) {
//       return res.status(404).json({ error: 'Patient not found' });
//     }

//     const documents = await prisma.medicalDocument.findMany({
//       where: { patientId: patient.patientId },
//       orderBy: { uploadDate: 'desc' },
//       select: {
//         id: true,
//         originalFileName: true,
//         fileSize: true,
//         uploadDate: true,
//         mimeType: true
//       }
//     });

//     res.json({ 
//       patient: {
//         // id: patient.id,
//         id: patientId,
//         name: patient.user.name,
//         email: patient.user.email
//       },
//       documents 
//     });

//   } catch (error) {
//     console.error('Failed to fetch patient documents:', error);
//     res.status(500).json({ error: 'Failed to fetch patient documents' });
//   }
// });

/**
 * GET /documents/:documentId/download
 * Generate download URL for a document
 * Patients can download their own documents
 * Providers can download any patient's documents
 */
router.get('/:documentId/download', authRequired, async (req, res) => {
  try {
    const { documentId } = req.params;
    const userRole = req.auth.role;
    
    // Find the document
    let document;
    
    if (userRole === 'patient') {
      // Patient can only access their own documents
      // const patient = await prisma.patient.findUnique({
      //   where: { userId: req.auth.userId }
      // });

      const patient = await prisma.patient.findUnique({
        where: { userId: req.auth.userId }
      });

      const patientId = patient.id;
      
      if (!patient) {
        return res.status(404).json({ error: 'Patient profile not found' });
      }
      
      document = await prisma.medicalDocument.findFirst({
        where: {
          id: documentId,
          patientId: patientId
        }
      });
    } else if (userRole === 'provider') {
      // Provider can access any patient's documents
      document = await prisma.medicalDocument.findUnique({
        where: { id: documentId }
      });
    }
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Generate presigned download URL
    const downloadUrl = azureBlobService.generateDownloadUrl(document.blobPath, 60); // 1 hour
    
    res.json({
      downloadUrl,
      originalFileName: document.originalFileName,
      fileSize: document.fileSize,
      expiresIn: 60 * 60 // seconds
    });

  } catch (error) {
    console.error('Failed to generate download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});



module.exports = router;