# Image Display Quick Reference

## What Was Added

### 1. **Admin Dashboard Enhancements** (`frontend/pages/admin.html`)
- ✅ Document viewer modal (`modal-doc-viewer`)
- ✅ View button (👁️) for each document in applicant detail
- ✅ Function: `viewDocumentImage(docId, docLabel, hasImage)`
- ✅ Image-handler.js script reference

### 2. **Image Utility Module** (`frontend/js/image-handler.js`)
Complete utility for handling base64 images:
```javascript
ImageHandler.base64ToDataUrl()        // Convert to data URL
ImageHandler.displayImage()           // Display in img element
ImageHandler.downloadImage()          // Download as file
ImageHandler.createThumbnail()        // Generate thumbnail
ImageHandler.validateImage()          // Check if valid image
ImageHandler.base64ToBlob()           // Convert to Blob
```

### 3. **Documentation** (`IMAGE_DISPLAY_GUIDE.md`)
Comprehensive guide with examples and troubleshooting

---

## Quick Start

### Display Image in Admin Dashboard
1. Open admin dashboard
2. Click on an applicant
3. Click 👁️ button next to any document
4. Full-screen viewer opens with image

### Use Image Handler in Custom Code
```javascript
// Include the script
<script src="/js/image-handler.js"></script>

// Display an image
const base64 = "iVBORw0K..."; // from database
const img = document.getElementById('myImage');
ImageHandler.displayImage(img, base64);

// Download an image
ImageHandler.downloadImage(base64, 'document.png');

// Create thumbnail
const thumb = await ImageHandler.createThumbnail(base64, 150, 150);
```

---

## API Endpoints

### Get Documents
```
GET /api/documents/:applicant_id
Returns: { success: true, data: [...documents with image_data...] }
```

### Upload Document
```
POST /api/documents
Body: { applicant_id, document_type, document_label, image_data }
Returns: { success: true, data: {...document...} }
```

---

## Database

### Image Storage
- **Table**: `documents`
- **Column**: `image_data` (TEXT - base64 PNG)
- **Format**: `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA...` (PNG header)
- **Encoding**: Base64 ASCII

---

## Display Format

All images display using HTML5 data URLs:
```html
<img src="data:image/png;base64,{BASE64_STRING}" />
```

No file uploads or server routes needed for display.

---

## Files Modified/Created

| File | Change | Purpose |
|------|--------|---------|
| `admin.html` | Updated | Added document viewer modal & view buttons |
| `image-handler.js` | **NEW** | Image conversion utilities |
| `IMAGE_DISPLAY_GUIDE.md` | **NEW** | Full documentation |

---

## Troubleshooting

### Image Won't Display
```javascript
// Check base64 is valid
const isValid = await ImageHandler.validateImage(base64);

// Check size
const fileSize = ImageHandler.formatFileSize(base64.length * 0.75);
console.log('Image size:', fileSize);

// Test base64 format (should start with iVBOR)
console.log(base64.substring(0, 4)); // Should be "iVBO"
```

### Image Too Large
```javascript
// Create smaller thumbnail
const thumb = await ImageHandler.createThumbnail(base64, 200, 200);
ImageHandler.displayImage(img, thumb);
```

---

## Next Steps

- ✅ Images display on admin dashboard
- ◻️ Add batch download feature
- ◻️ Add image annotation tools
- ◻️ Add OCR overlay on images
- ◻️ Add document comparison view

