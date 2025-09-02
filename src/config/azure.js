// src/config/azure.js
// const { BlobServiceClient } = require('@azure/storage-blob');
// const { generateBlobSASQueryParameters, BlobSASPermissions, ContainerSASPermissions } = require('@azure/storage-blob');

const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');


class AzureBlobService {

    constructor() {
        this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'medical-documents';
        
        if (!this.connectionString) {
          throw new Error('Azure Storage connection string not configured');
        }
        
        this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        
        // Extract account name and key from connection string
        const accountNameMatch = this.connectionString.match(/AccountName=([^;]+)/);
        const accountKeyMatch = this.connectionString.match(/AccountKey=([^;]+)/);
        
        if (!accountNameMatch || !accountKeyMatch) {
          throw new Error('Invalid Azure Storage connection string format');
        }
        
        this.accountName = accountNameMatch[1];
        this.accountKey = accountKeyMatch[1];
      }


  async initializeContainer() {
    try {
      // Create container without public access (private by default)
      await this.containerClient.createIfNotExists();
    } catch (error) {
      console.error('Failed to initialize container:', error);
      throw error;
    }
  }

//   generateUploadUrl(blobName, expiresInMinutes = 15) {
//     const blobClient = this.containerClient.getBlobClient(blobName);
    
//     const sasOptions = {
//       containerName: this.containerName,
//       blobName,
//       permissions: BlobSASPermissions.parse('cw'), // write permission only
//       expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000)
//     };

//     const sasToken = generateBlobSASQueryParameters(
//       sasOptions,
//       { accountName: this.accountName, accountKey: this.accountKey }
//     ).toString();

//     return `${blobClient.url}?${sasToken}`;
//   }

generateUploadUrl(blobName, expiresInMinutes = 15) {
    const sasOptions = {
      containerName: this.containerName,
      blobName,
      permissions: BlobSASPermissions.parse("cw"), // create + write
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + expiresInMinutes * 60 * 1000)
    };
  
    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      new StorageSharedKeyCredential(this.accountName, this.accountKey)
    ).toString();
  
    const blobClient = this.containerClient.getBlobClient(blobName);
    return `${blobClient.url}?${sasToken}`;
  }

//   generateDownloadUrl(blobName, expiresInMinutes = 60) {
//     const blobClient = this.containerClient.getBlobClient(blobName);
    
//     const sasOptions = {
//       containerName: this.containerName,
//       blobName,
//       permissions: BlobSASPermissions.parse('r'), // read permission only
//       expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000)
//     };

//     const sasToken = generateBlobSASQueryParameters(
//       sasOptions,
//       { accountName: this.accountName, accountKey: this.accountKey }
//     ).toString();

//     return `${blobClient.url}?${sasToken}`;
//   }

generateDownloadUrl(blobName, expiresInMinutes = 60) {
    const blobClient = this.containerClient.getBlobClient(blobName);
    
    const sasOptions = {
      containerName: this.containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'), // read only
      startsOn: new Date(), // optional, but good practice
      expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000)
    };
  
    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      new StorageSharedKeyCredential(this.accountName, this.accountKey) // ✅ FIXED
    ).toString();
  
    return `${blobClient.url}?${sasToken}`;
  }
  

  async checkBlobExists(blobName) {
    try {
      const blobClient = this.containerClient.getBlobClient(blobName);
      return await blobClient.exists();
    } catch (error) {
      return false;
    }
  }

  async deleteBlobIfExists(blobName) {
    try {
      const blobClient = this.containerClient.getBlobClient(blobName);
      await blobClient.deleteIfExists();
      return true;
    } catch (error) {
      console.error('Failed to delete blob:', error);
      return false;
    }
  }

  generateBlobName(userId, originalFileName) {
    const timestamp = Date.now();
    const extension = originalFileName.split('.').pop();
    const sanitizedName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `patients/${userId}/${timestamp}-${sanitizedName}`;
  }
}

module.exports = { AzureBlobService };