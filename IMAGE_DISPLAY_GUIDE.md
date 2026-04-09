# Image Display Guide for KiosKonnekt Admin Dashboard

## Overview

This guide explains how to retrieve image data from the database and display it on the admin dashboard. Images are stored as **base64-encoded strings** in the `documents` table's `image_data` column.

---

## Architecture

### Database Storage (Backend)
- **Table**: `documents`
- **Column**: `image_data` (TEXT - base64 encoded)
- **Format**: Base64 PNG images
- **Size Limit**: Text column can handle images up to several MB

### Frontend Display
- **Location**: Admin Dashboard at `/pages/admin.html`
- **Method**: Direct base64 data URL conversion
- **Viewer**: Custom modal with full-screen image display

---

## How It Works

### 1. **Backend - Retrieving Image Data**

The API already has a built-in endpoint to retrieve documents with image data:

```javascript
// GET /api/documents/:applicant_id
// Returns all documents for an applicant including image_data

fetch('/api/documents/applicant-id-123')
  .then(res => res.json())
  .then(data => {
    // data.data contains array of documents with image_data
    console.log(data.data); // Array of documents with base64 image data
  });
```

**Response Example:**
```json
{
  "success": true,
  "data": [
    {
      "id": "doc-123",
      "applicant_id": "app-456",
      "document_type": "psa_birth_cert",
      "document_label": "PSA Birth Certificate",
      "image_data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "captured_at": "2026-04-09T12:00:00Z",
      "verified": true
    }
  ]
}
```

### 2. **Frontend - Converting Base64 to Display**

Base64 images can be displayed directly using a **data URL**:

```javascript
// Convert base64 to displayable format
const imageData = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR...";
const dataUrl = `data:image/png;base64,${imageData}`;

// Use in HTML directly
document.getElementById('preview').innerHTML = `<img src="${dataUrl}" />`;
```

### 3. **Admin Dashboard - Document Viewer**

The admin dashboard now includes:

#### a) **Document List with View Button**
- Click the 👁️ **View** button on any document to open full-screen viewer
- Shows image metadata (type, size, capture date)

#### b) **Document Viewer Modal**
- Full-screen display of the image
- Shows document metadata
- Handles missing images gracefully
- Mobile-responsive design

---

## Frontend Implementation Details

### A. Updated Admin Dashboard (`admin.html`)

1. **Document List Enhancement** (Line ~450)
   - Added 👁️ View button for each document
   - Passes document ID and label to viewer

2. **Document Viewer Modal** (Added after main modals)
   ```html
   <div id="modal-doc-viewer" class="modal-overlay">
     <!-- Full-screen image display -->
     <!-- Metadata footer with file size and date -->
   </div>
   ```

3. **Image Display Function** (`viewDocumentImage()`)
   ```javascript
   function viewDocumentImage(docId, docLabel, hasImage) {
     // Opens modal with full image display
     // Retrieves base64 from currentApplicantDetail
     // Shows fallback if no image available
   }
   ```

### B. Utility Module (`image-handler.js`)

A comprehensive utility module for image handling:

```javascript
// Include in HTML:
<script src="/js/image-handler.js"></script>

// Usage examples:
ImageHandler.base64ToDataUrl(base64String);           // Get data URL
ImageHandler.downloadImage(base64String, 'doc.png');  // Download image
ImageHandler.createThumbnail(base64String, 150, 150); // Create thumbnail
ImageHandler.validateImage(base64String);             // Validate image
ImageHandler.displayImage(imgElement, base64String);  // Display in element
```

---

## Usage Examples

### Example 1: Display Document in Admin Dashboard

```javascript
// Already implemented in admin.html
async function viewApplicant(applicantId) {
  const res = await API.get(`/admin/applicants/${applicantId}`);
  const applicant = res.data;
  
  // applicant.documents now contains base64 images
  applicant.documents.forEach(doc => {
    console.log(doc.image_data); // Full base64 string
  });
}
```

### Example 2: Display Single Image

```javascript
// In your own code:
const imageData = "iVBORw0K..."; // Base64 from database

// Method 1: Using utility
ImageHandler.displayImage(document.getElementById('myImg'), imageData);

// Method 2: Direct HTML
document.getElementById('myImg').src = `data:image/png;base64,${imageData}`;
```

### Example 3: Download Image

```javascript
const document = {
  document_label: "Birth Certificate",
  image_data: "iVBORw0K..." // Base64
};

// Using utility
ImageHandler.downloadImage(
  document.image_data,
  `${document.document_label}.png`
);
```

### Example 4: Create and Display Thumbnail

```javascript
async function showThumbnails(documents) {
  for (let doc of documents) {
    const thumbnail = await ImageHandler.createThumbnail(doc.image_data, 150, 150);
    
    // Display thumbnail
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${thumbnail}`;
    document.getElementById('gallery').appendChild(img);
  }
}
```

---

## How to Use on Admin Dashboard

### Viewing Documents

1. **Open Admin Dashboard** → Navigate to an applicant
2. **Click 👁️ View** button next to any document
3. **Full-screen viewer** opens with:
   - Full-resolution image
   - Document type, size, and capture date
   - All in a clean modal interface

### Available Functions

```javascript
// View document (already wired up in dashboard)
viewDocumentImage(docId, docLabel, hasImage);

// Edit document (shows image preview + metadata)
editDocument(docId, currentLabel, currentType);

// Delete document
deleteDocument(docId);

// Reload applicant data
viewApplicant(applicantId);
```

---

## Backend Routes

### Get All Documents for Applicant
```
GET /api/documents/:applicant_id

Response:
{
  "success": true,
  "data": [
    {
      "id": "...",
      "applicant_id": "...",
      "document_type": "psa_birth_cert",
      "document_label": "PSA Birth Certificate",
      "image_data": "base64_string_here",
      "captured_at": "2026-04-09T12:00:00Z",
      "verified": true
    }
  ]
}
```

### Upload Document with Image
```
POST /api/documents

Body:
{
  "applicant_id": "app-123",
  "document_type": "psa_birth_cert",
  "document_label": "PSA Birth Certificate",
  "image_data": "base64_string_here"
}

Response:
{
  "success": true,
  "data": { /* saved document */ }
}
```

---

## Converting Image to Base64

### Browser
```javascript
// From File Input
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = event.target.result.split(',')[1];
    console.log(base64); // Use this for API
  };
  reader.readAsDataURL(file);
});
```

### Server/Node.js
```javascript
const fs = require('fs');
const base64 = fs.readFileSync('image.png', 'base64');
```

### Python
```python
import base64
with open('image.png', 'rb') as f:
    base64_string = base64.b64encode(f.read()).decode()
```

### CLI
```bash
# Linux/Mac
base64 -i image.png -o image.b64

# Check conversion
base64 -D image.b64 > image-decoded.png
```

---

## Troubleshooting

### Image Not Displaying
1. **Check if base64 exists**: `console.log(doc.image_data)`
2. **Verify format**: Should start with `iVBOR...` (PNG header)
3. **Check size**: Use `ImageHandler.formatFileSize(data.length)`
4. **Test data URL**: `data:image/png;base64,{your_base64}`

### Large Images Loading Slowly
1. **Create thumbnails** for preview: `ImageHandler.createThumbnail()`
2. **Compress before storage** using image optimization
3. **Use lazy loading** on galleries

### Images Corrupted
1. **Validate** before display: `ImageHandler.validateImage()`
2. **Check encoding**: Ensure proper base64 encoding
3. **Test in database**: Query directly and validate

---

## Performance Tips

1. **Lazy Load**: Only fetch images when needed
2. **Thumbnails**: Display small thumbnails in lists
3. **Compression**: Compress images before storing
4. **Caching**: Cache base64 in session if used multiple times

```javascript
// Cache example
const imageCache = new Map();

function getCachedImage(docId) {
  if (imageCache.has(docId)) {
    return imageCache.get(docId);
  }
  // Fetch and cache
}
```

---

## File Structure

```
kioskonnekt/
├── frontend/
│   ├── js/
│   │   ├── app.js              # Main app logic
│   │   └── image-handler.js    # NEW: Image utilities
│   └── pages/
│       └── admin.html          # UPDATED: Document viewer
├── backend/
│   ├── routes/
│   │   └── documents.js        # API endpoints
│   └── db/
│       └── supabase.js         # Database queries
└── IMAGE_DISPLAY_GUIDE.md      # This file
```

---

## Next Steps

1. ✅ Screenshots stored as base64 in database
2. ✅ Admin dashboard displays images in modal
3. ✅ Utility functions for image handling
4. 🔄 Optional: Add batch download feature
5. 🔄 Optional: Add image annotation tools
6. 🔄 Optional: Add OCR result overlay

---

## Support

For issues or questions about image display:
1. Check browser console for errors
2. Verify base64 format in database
3. Test with `ImageHandler.validateImage()`
4. Check network tab in DevTools for API responses

