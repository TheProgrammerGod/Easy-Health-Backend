// test-azure.js
require('dotenv').config(); // Load environment variables

const { AzureBlobService } = require('./src/config/azure');

async function testAzureConnection() {
  try {
    console.log('Testing Azure connection...');
    console.log('Connection string:', process.env.AZURE_STORAGE_CONNECTION_STRING ? 'Present' : 'Missing');
    console.log('Container name:', process.env.AZURE_STORAGE_CONTAINER_NAME);
    
    const azure = new AzureBlobService();
    console.log('Azure client created successfully');
    
    await azure.initializeContainer();
    console.log('Container initialized successfully');
    
    // Test SAS token generation
    const testUrl = azure.generateUploadUrl('test-file.pdf', 15);
    console.log('Generated URL:', testUrl);
    
    console.log('Azure connection test completed successfully');
  } catch (error) {
    console.error('Azure connection failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

testAzureConnection();