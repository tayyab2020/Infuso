// One-off: converts the large product/editorial images and film-scrub frames
// to WebP (much smaller than the PNG/JPG originals at equivalent visual
// quality), replacing the source files in place. Run once, then the storefront
// template fallbacks, DB image URLs, and film-frame extension are updated to
// match in a follow-up pass.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'public', 'products');

// Photographic, no-alpha shots — safe to resize down (editorial-wide cards
// never render anywhere near their original 2400px source width) and encode
// as WebP at a quality that keeps them visually lossless-ish.
const PHOTO_IMAGES = [
  { file: 'oudor_wood.png', maxWidth: 1600 },
  { file: 'aether_dark.png', maxWidth: 1600 },
  { file: 'collection-banner.png', maxWidth: 2000 },
  { file: 'aria_hands.png', maxWidth: 1600 },
  { file: 'oudor_rocks.jpg', maxWidth: 1600 },
  { file: 'aria_citrus.jpg', maxWidth: 1600 },
  { file: 'aether_slate.jpg', maxWidth: 1600 },
];

// Product renders with transparency — higher quality to protect glass/label
// edges, no resize (already sized close to display size).
const ALPHA_IMAGES = [
  'aether.png', 'aria.png', 'oudor.png',
  'aether_box.png', 'aria_box.png', 'oudor_box.png',
];

async function convertOne(file, { maxWidth, quality, alpha } = {}) {
  const inPath = path.join(PRODUCTS_DIR, file);
  const outFile = file.replace(/\.(png|jpe?g)$/i, '.webp');
  const outPath = path.join(PRODUCTS_DIR, outFile);
  const beforeSize = fs.statSync(inPath).size;

  let pipeline = sharp(inPath);
  if (maxWidth) pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  pipeline = pipeline.webp({ quality, alphaQuality: alpha ? 90 : undefined });
  await pipeline.toFile(outPath);

  const afterSize = fs.statSync(outPath).size;
  console.log(
    `${file} -> ${outFile}: ${(beforeSize / 1024).toFixed(0)}KB -> ${(afterSize / 1024).toFixed(0)}KB ` +
    `(${(100 - (afterSize / beforeSize) * 100).toFixed(0)}% smaller)`
  );
}

async function convertFrames(dir, quality) {
  const dirPath = path.join(PRODUCTS_DIR, dir);
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.jpg'));
  let beforeTotal = 0;
  let afterTotal = 0;
  for (const file of files) {
    const inPath = path.join(dirPath, file);
    const outPath = path.join(dirPath, file.replace(/\.jpg$/, '.webp'));
    beforeTotal += fs.statSync(inPath).size;
    await sharp(inPath).webp({ quality }).toFile(outPath);
    afterTotal += fs.statSync(outPath).size;
  }
  console.log(
    `${dir}: ${files.length} frames, ${(beforeTotal / 1024 / 1024).toFixed(1)}MB -> ` +
    `${(afterTotal / 1024 / 1024).toFixed(1)}MB (${(100 - (afterTotal / beforeTotal) * 100).toFixed(0)}% smaller)`
  );
}

(async () => {
  for (const { file, maxWidth } of PHOTO_IMAGES) {
    await convertOne(file, { maxWidth, quality: 80 });
  }
  for (const file of ALPHA_IMAGES) {
    await convertOne(file, { quality: 85, alpha: true });
  }
  await convertFrames('film-frames', 72);
  await convertFrames('film-frames-mobile', 72);
  console.log('Done.');
})();
