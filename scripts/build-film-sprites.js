// One-off: packs the 120 individual scroll-scrub frames (per device dir) into
// 10 sprite sheets of 12 frames each (4 cols x 3 rows), cutting the frame
// sequence from 120 HTTP requests down to 10. Run once, then the frame
// JS + rendering logic is updated to crop from sheets instead of loading
// each frame as its own <img>.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'public', 'products');
const COLS = 4;
const ROWS = 3;
const FRAMES_PER_SHEET = COLS * ROWS; // 12
const TOTAL_FRAMES = 120;
const SHEET_COUNT = TOTAL_FRAMES / FRAMES_PER_SHEET; // 10

async function buildSheets(dir) {
  const dirPath = path.join(PRODUCTS_DIR, dir);
  const first = await sharp(path.join(dirPath, 'f000.webp')).metadata();
  const frameW = first.width, frameH = first.height;
  const sheetW = frameW * COLS, sheetH = frameH * ROWS;

  let totalBefore = 0;
  let totalAfter = 0;
  for (let sheet = 0; sheet < SHEET_COUNT; sheet++) {
    const composites = [];
    for (let i = 0; i < FRAMES_PER_SHEET; i++) {
      const frameIdx = sheet * FRAMES_PER_SHEET + i;
      const file = path.join(dirPath, 'f' + String(frameIdx).padStart(3, '0') + '.webp');
      totalBefore += fs.statSync(file).size;
      const col = i % COLS, row = Math.floor(i / COLS);
      composites.push({ input: file, left: col * frameW, top: row * frameH });
    }
    const outFile = path.join(dirPath, 'sprite_' + String(sheet).padStart(2, '0') + '.webp');
    await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#000' } })
      .composite(composites)
      .webp({ quality: 75 })
      .toFile(outFile);
    totalAfter += fs.statSync(outFile).size;
  }
  console.log(
    `${dir}: ${TOTAL_FRAMES} frames -> ${SHEET_COUNT} sheets (${frameW}x${frameH} each, ` +
    `sheet ${sheetW}x${sheetH}), ${(totalBefore / 1024 / 1024).toFixed(1)}MB -> ${(totalAfter / 1024 / 1024).toFixed(1)}MB`
  );
}

(async () => {
  await buildSheets('film-frames');
  await buildSheets('film-frames-mobile');
  console.log('Done. Frame layout: ' + COLS + ' cols x ' + ROWS + ' rows, ' + FRAMES_PER_SHEET + ' frames/sheet.');
})();
