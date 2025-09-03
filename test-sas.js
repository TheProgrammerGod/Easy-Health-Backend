// test-sas.js
require('dotenv').config();
const { AzureBlobService } = require('./src/config/azure');

async function testSAS() {
  try {
    const azure = new AzureBlobService();
    await azure.initializeContainer();
    
    // Generate a test SAS URL using the same method as your route
    const testPatientId = 'test-patient-id'; // Mock patient ID
    const testOriginalFileName = 'test-file.pdf';
    const testBlobName = azure.generateBlobName(testPatientId, testOriginalFileName);
    
    console.log('Generated blob name:', testBlobName);
    
    const uploadUrl = azure.generateUploadUrl(testBlobName, 15);
    console.log('Generated SAS URL:', uploadUrl);
    
    // Try to upload a small test file using the SAS URL
    const testContent = 'This is a test file content';
    
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': 'application/pdf',
        'Content-Length': testContent.length.toString()
      },
      body: testContent
    });
    
    console.log('Upload response status:', response.status);
    if (response.status === 201) {
      console.log('Upload successful!');
    } else {
      console.log('Upload failed with status:', response.status);
      console.log('Response text:', await response.text());
    }
  } catch (error) {
    console.error('SAS test failed:', error);
  }
}

testSAS();