/**
 * Image Handler Utility
 * Manages conversion and display of base64 images from the database
 */

const ImageHandler = {
  /**
   * Convert base64 string to Blob
   * @param {string} base64String - The base64 encoded image data
   * @param {string} mimeType - Image MIME type (default: 'image/png')
   * @returns {Blob} The image as a Blob object
   */
  base64ToBlob(base64String, mimeType = 'image/png') {
    const byteCharacters = atob(base64String);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  },

  /**
   * Convert base64 to data URL for direct display
   * @param {string} base64String - The base64 encoded image data
   * @param {string} mimeType - Image MIME type (default: 'image/png')
   * @returns {string} Data URL ready for <img> src attribute
   */
  base64ToDataUrl(base64String, mimeType = 'image/png') {
    return `data:${mimeType};base64,${base64String}`;
  },

  /**
   * Download a base64 image
   * @param {string} base64String - The base64 encoded image data
   * @param {string} filename - Name for the downloaded file
   * @param {string} mimeType - Image MIME type (default: 'image/png')
   */
  downloadImage(base64String, filename, mimeType = 'image/png') {
    const blob = this.base64ToBlob(base64String, mimeType);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'document.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Display a base64 image in an img element
   * @param {HTMLImageElement} imgElement - The image element to populate
   * @param {string} base64String - The base64 encoded image data
   * @param {string} mimeType - Image MIME type (default: 'image/png')
   */
  displayImage(imgElement, base64String, mimeType = 'image/png') {
    if (!imgElement) return;
    const dataUrl = this.base64ToDataUrl(base64String, mimeType);
    imgElement.src = dataUrl;
    imgElement.onerror = () => {
      console.error('Failed to display image');
      imgElement.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="14"%3EImage Load Failed%3C/text%3E%3C/svg%3E';
    };
  },

  /**
   * Convert base64 to Canvas for manipulation
   * @param {string} base64String - The base64 encoded image data
   * @returns {Promise<HTMLCanvasElement>} Canvas element with the image drawn
   */
  async base64ToCanvas(base64String) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = this.base64ToDataUrl(base64String);
    });
  },

  /**
   * Get image dimensions from base64
   * @param {string} base64String - The base64 encoded image data
   * @returns {Promise<{width: number, height: number}>} Image dimensions
   */
  async getImageDimensions(base64String) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => reject(new Error('Failed to get image dimensions'));
      img.src = this.base64ToDataUrl(base64String);
    });
  },

  /**
   * Create a thumbnail from base64 image
   * @param {string} base64String - The base64 encoded image data
   * @param {number} maxWidth - Maximum width for thumbnail
   * @param {number} maxHeight - Maximum height for thumbnail
   * @returns {Promise<string>} Base64 encoded thumbnail
   */
  async createThumbnail(base64String, maxWidth = 150, maxHeight = 150) {
    const canvas = await this.base64ToCanvas(base64String);
    
    let width = canvas.width;
    let height = canvas.height;
    
    if (width > height) {
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
    }
    
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = width;
    thumbCanvas.height = height;
    const ctx = thumbCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, width, height);
    
    return thumbCanvas.toDataURL('image/png').split(',')[1];
  },

  /**
   * Validate if a base64 string is a valid image
   * @param {string} base64String - The base64 encoded image data
   * @param {number} timeout - Timeout in milliseconds (default: 5000)
   * @returns {Promise<boolean>} True if valid image, false otherwise
   */
  async validateImage(base64String, timeout = 5000) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(false);
      }, timeout);
      
      const img = new Image();
      img.onload = () => {
        clearTimeout(timeoutId);
        resolve(true);
      };
      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(false);
      };
      img.src = this.base64ToDataUrl(base64String);
    });
  },

  /**
   * Format file size in human-readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
};

// Export for use in modules if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageHandler;
}
