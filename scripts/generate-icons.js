#!/usr/bin/env node

/**
 * Pre-generate all battery icon combinations at build time.
 * This avoids needing sharp at runtime.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'icons');

// Battery level buckets: 0=empty/null, 1=critical(1-10), 2=low(11-25), 3=medium(26-50), 4=good(51-100)
const LEVELS = [0, 1, 2, 3, 4];
const THEMES = ['light', 'dark'];

// Colors for each level
function getColor(level) {
  switch (level) {
    case 0: return '#888888'; // gray for null/empty
    case 1: return '#FF4444'; // red for critical
    case 2: return '#FF8800'; // orange for low
    case 3: return '#FFCC00'; // yellow for medium
    case 4: return '#44CC44'; // green for good
    default: return '#888888';
  }
}

// Fill percentage for each level
function getFillPercent(level) {
  switch (level) {
    case 0: return 0;
    case 1: return 0.1;
    case 2: return 0.25;
    case 3: return 0.5;
    case 4: return 1.0;
    default: return 0;
  }
}

function createSvg(leftLevel, rightLevel, theme) {
  const width = 64;
  const height = 64;
  
  const outlineColor = theme === 'dark' ? '#FFFFFF' : '#000000';
  
  const leftFillColor = getColor(leftLevel);
  const rightFillColor = getColor(rightLevel);
  
  const batteryWidth = 24;
  const batteryHeight = 48;
  const batteryFillHeight = batteryHeight - 8;
  const leftFill = getFillPercent(leftLevel) * batteryFillHeight;
  const rightFill = getFillPercent(rightLevel) * batteryFillHeight;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="2" y="10" width="${batteryWidth}" height="${batteryHeight}" rx="4" fill="none" stroke="${outlineColor}" stroke-width="3"/>
  <rect x="8" y="4" width="12" height="8" rx="2" fill="${outlineColor}"/>
  <rect x="5" y="${14 + batteryFillHeight - leftFill}" width="${batteryWidth - 6}" height="${leftFill}" rx="2" fill="${leftFillColor}"/>
  
  <rect x="38" y="10" width="${batteryWidth}" height="${batteryHeight}" rx="4" fill="none" stroke="${outlineColor}" stroke-width="3"/>
  <rect x="44" y="4" width="12" height="8" rx="2" fill="${outlineColor}"/>
  <rect x="41" y="${14 + batteryFillHeight - rightFill}" width="${batteryWidth - 6}" height="${rightFill}" rx="2" fill="${rightFillColor}"/>
</svg>`;
}

async function generateIcons() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let count = 0;
  
  for (const theme of THEMES) {
    for (const left of LEVELS) {
      for (const right of LEVELS) {
        const svg = createSvg(left, right, theme);
        const filename = `battery_${theme}_${left}_${right}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);
        
        await sharp(Buffer.from(svg))
          .resize(64, 64)
          .png()
          .toFile(filepath);
        
        count++;
      }
    }
  }
  
  console.log(`Generated ${count} battery icons in ${OUTPUT_DIR}`);
}

generateIcons().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
