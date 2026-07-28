const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = { 'image/png': true, 'image/jpeg': true, 'image/webp': true };

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!ALLOWED[file.mimetype]),
});

// Re-encodes every upload to WebP server-side (whatever format it came in as)
// so admins never have to remember to optimize product images themselves —
// mirrors the one-off conversion already done for the original product photos.
async function toWebp(req, res, next) {
  if (!req.file) return next();
  try {
    const filename = crypto.randomUUID() + '.webp';
    await sharp(req.file.buffer)
      .resize({ width: 2000, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(UPLOAD_DIR, filename));
    req.file.filename = filename;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Could not process image file.' });
  }
}

module.exports = {
  single: (field) => [multerUpload.single(field), toWebp],
};
