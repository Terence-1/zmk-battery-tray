/**
 * ZMK Battery Tray - Main Electron Process
 * System tray application for monitoring ZMK split keyboard battery levels
 */

import { app, Tray, Menu, nativeImage, NativeImage, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ZMKBatteryReader, BatteryLevels } from './battery-reader';

// Disable sandbox on Linux (required for development without root permissions)
app.commandLine.appendSwitch('no-sandbox');

// Prevent garbage collection of tray
let tray: Tray | null = null;
let batteryReader: ZMKBatteryReader | null = null;
let currentLevels: BatteryLevels = { left: null, right: null, timestamp: new Date() };

// Temp directory for icons
const tmpDir = path.join(os.tmpdir(), 'zmk-battery-tray');

// Polling interval in milliseconds (1 minute)
const POLL_INTERVAL = 60000;

// Ensure temp directory exists
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

/**
 * Get background and text colors based on system theme
 */
function getThemeColors(): { bg: string; text: string } {
  const isDark = nativeTheme.shouldUseDarkColors;
  return {
    bg: isDark ? '#1a1a1a' : '#f0f0f0',
    text: isDark ? '#ffffff' : '#000000',
  };
}

/**
 * Get color based on battery level
 */
function getBatteryColor(level: number | null): string {
  if (level === null) return '#888888'; // Gray for unknown
  if (level <= 10) return '#FF4444';    // Red for critical
  if (level <= 25) return '#FF8800';    // Orange for low
  if (level <= 50) return '#FFCC00';    // Yellow for medium
  return '#44CC44';                      // Green for good
}

/**
 * Create SVG content for battery icon
 * Two battery icons side by side - left position = left half, right position = right half
 */
function createSvgContent(leftLevel: number | null, rightLevel: number | null): string {
  const width = 200;
  const height = 200;
  
  const leftColor = getBatteryColor(leftLevel);
  const rightColor = getBatteryColor(rightLevel);
  
  // Battery body dimensions
  const batteryWidth = 80;
  const batteryHeight = 160;
  const batteryFillHeight = batteryHeight - 20;
  const leftFill = leftLevel !== null ? (leftLevel / 100) * batteryFillHeight : 0;
  const rightFill = rightLevel !== null ? (rightLevel / 100) * batteryFillHeight : 0;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Left battery -->
  <rect x="5" y="25" width="${batteryWidth}" height="${batteryHeight}" rx="12" ry="12" fill="none" stroke="${leftColor}" stroke-width="8"/>
  <rect x="25" y="10" width="40" height="18" rx="6" ry="6" fill="${leftColor}"/>
  <rect x="13" y="${35 + batteryFillHeight - leftFill}" width="${batteryWidth - 16}" height="${leftFill}" rx="6" fill="${leftColor}"/>
  
  <!-- Right battery -->
  <rect x="105" y="25" width="${batteryWidth}" height="${batteryHeight}" rx="12" ry="12" fill="none" stroke="${rightColor}" stroke-width="8"/>
  <rect x="125" y="10" width="40" height="18" rx="6" ry="6" fill="${rightColor}"/>
  <rect x="113" y="${35 + batteryFillHeight - rightFill}" width="${batteryWidth - 16}" height="${rightFill}" rx="6" fill="${rightColor}"/>
</svg>`;
}

/**
 * Create battery icon by writing SVG to file and loading it
 */
async function createBatteryIcon(leftLevel: number | null, rightLevel: number | null): Promise<NativeImage> {
  const svg = createSvgContent(leftLevel, rightLevel);
  const svgPath = path.join(tmpDir, 'battery-icon.svg');
  
  // Write SVG to file
  fs.writeFileSync(svgPath, svg);
  
  // Try to convert with sharp if available
  try {
    const sharp = require('sharp');
    const pngPath = path.join(tmpDir, 'battery-icon.png');
    await sharp(svgPath)
      .png()
      .toFile(pngPath);
    
    const img = nativeImage.createFromPath(pngPath);
    console.log(`Icon created from PNG: ${img.getSize().width}x${img.getSize().height}`);
    return img;
  } catch (e) {
    console.error('Sharp not available, trying direct SVG load');
    // Fallback: try loading SVG directly
    const img = nativeImage.createFromPath(svgPath);
    console.log(`Icon created from SVG: ${img.getSize().width}x${img.getSize().height}`);
    return img;
  }
}

/**
 * Create a simple default icon
 */
function createDefaultIcon(): NativeImage {
  const svg = createSvgContent(null, null);
  const svgPath = path.join(tmpDir, 'battery-icon-default.svg');
  fs.writeFileSync(svgPath, svg);
  
  try {
    const sharp = require('sharp');
    const pngPath = path.join(tmpDir, 'battery-icon-default.png');
    // Use sync version for initial icon
    require('child_process').execSync(
      `node -e "require('sharp')('${svgPath}').png().toFile('${pngPath}')"`
    );
    const img = nativeImage.createFromPath(pngPath);
    if (!img.isEmpty()) {
      console.log(`Default icon created: ${img.getSize().width}x${img.getSize().height}`);
      return img;
    }
  } catch (e) {
    console.error('Failed to create default icon with sharp:', e);
  }
  
  // Ultimate fallback: create a simple 1x1 pixel icon
  const fallbackPath = path.join(tmpDir, 'fallback.png');
  // Minimal valid PNG (1x1 green pixel)
  const minimalPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x91, 0x68, 0x36, 0x00, 0x00, 0x00,
    0x1C, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x60, 0xA0, 0x34, 0x60,
    0x64, 0x60, 0x60, 0x60, 0x60, 0xF8, 0xCF, 0xC0, 0xC0, 0xC0, 0x00, 0x00,
    0x00, 0x00, 0xFF, 0xFF, 0x03, 0x00, 0x06, 0x40, 0x01, 0x01, 0x4E, 0x7D,
    0x8A, 0x9F, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
    0x60, 0x82
  ]);
  fs.writeFileSync(fallbackPath, minimalPng);
  return nativeImage.createFromPath(fallbackPath);
}

/**
 * Update the tray icon and tooltip
 */
async function updateTray(): Promise<void> {
  if (!tray) return;

  const { left, right } = currentLevels;
  
  // Update icon
  const icon = await createBatteryIcon(left, right);
  if (!icon.isEmpty()) {
    tray.setImage(icon);
  } else {
    console.error('Created icon is empty!');
  }

  // Update tooltip
  const leftStr = left !== null ? `${left}%` : 'N/A';
  const rightStr = right !== null ? `${right}%` : 'N/A';
  tray.setToolTip(`ZMK Battery\nLeft: ${leftStr}\nRight: ${rightStr}`);

  // Update context menu
  updateContextMenu();
}

/**
 * Update the context menu with current battery levels
 */
function updateContextMenu(): void {
  if (!tray) return;

  const { left, right, timestamp } = currentLevels;
  const leftStr = left !== null ? `${left}%` : 'Not connected';
  const rightStr = right !== null ? `${right}%` : 'Not connected';
  const timeStr = timestamp.toLocaleTimeString();
  const connected = batteryReader?.isConnected() ?? false;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Left Half: ${leftStr}`,
      enabled: false,
    },
    {
      label: `Right Half: ${rightStr}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `Last updated: ${timeStr}`,
      enabled: false,
    },
    {
      label: connected ? 'Device connected' : 'Device disconnected',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Refresh Now',
      click: () => {
        if (batteryReader?.isConnected()) {
          currentLevels = batteryReader.readBatteryLevels();
          updateTray();
        } else {
          tryConnect();
        }
      },
    },
    {
      label: 'Reconnect Device',
      click: () => {
        tryConnect();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Try to connect to ZMK device
 */
function tryConnect(): void {
  if (batteryReader) {
    batteryReader.disconnect();
  }

  batteryReader = new ZMKBatteryReader();
  
  if (batteryReader.connect()) {
    console.log('Connected to ZMK device');
    
    // Start polling
    batteryReader.startPolling(POLL_INTERVAL, (levels) => {
      currentLevels = levels;
      updateTray();
    });
  } else {
    console.log('Failed to connect to ZMK device');
    currentLevels = { left: null, right: null, timestamp: new Date() };
    updateTray();
    
    // Retry connection after a delay
    setTimeout(tryConnect, 10000);
  }
}

/**
 * Initialize the application
 */
async function createTray(): Promise<void> {
  // Create tray with default icon
  const icon = createDefaultIcon();
  
  console.log(`Default icon: ${icon.getSize().width}x${icon.getSize().height}, empty=${icon.isEmpty()}`);
  
  tray = new Tray(icon);
  tray.setToolTip('ZMK Battery Tray - Initializing...');

  // Set up initial context menu
  updateContextMenu();

  // Try to connect to device
  tryConnect();
}

// Don't show dock icon on macOS
app.dock?.hide?.();

// Prevent app from quitting when all windows closed
app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

// Initialize when ready
app.whenReady().then(() => {
  createTray();
  
  // Listen for theme changes and update icon
  nativeTheme.on('updated', () => {
    console.log('Theme changed, updating icon...');
    updateTray();
  });
});

// Cleanup on quit
app.on('before-quit', () => {
  if (batteryReader) {
    batteryReader.disconnect();
  }
  // Clean up temp files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});
