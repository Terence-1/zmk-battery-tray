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

// Sharp module (loaded dynamically)
let sharp: any = null;

// Ensure temp directory exists
try {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
} catch (e) {
  console.error('Failed to create temp directory:', e);
}

// Try to load sharp
try {
  sharp = require('sharp');
  console.log('Sharp loaded successfully');
} catch (e) {
  console.error('Sharp not available:', e);
}

/**
 * Get color based on battery level, with theme awareness for unknown state
 */
function getBatteryColor(level: number | null): string {
  if (level === null) {
    const isDark = nativeTheme.shouldUseDarkColors;
    return isDark ? '#AAAAAA' : '#666666';
  }
  if (level <= 10) return '#FF4444';
  if (level <= 25) return '#FF8800';
  if (level <= 50) return '#FFCC00';
  return '#44CC44';
}

/**
 * Create SVG content for battery icon
 */
function createSvgContent(leftLevel: number | null, rightLevel: number | null): string {
  const width = 64;
  const height = 64;
  
  const isDark = nativeTheme.shouldUseDarkColors;
  const outlineColor = isDark ? '#FFFFFF' : '#000000';
  
  const leftFillColor = getBatteryColor(leftLevel);
  const rightFillColor = getBatteryColor(rightLevel);
  
  const batteryWidth = 24;
  const batteryHeight = 48;
  const batteryFillHeight = batteryHeight - 8;
  const leftFill = leftLevel !== null ? (leftLevel / 100) * batteryFillHeight : 0;
  const rightFill = rightLevel !== null ? (rightLevel / 100) * batteryFillHeight : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="2" y="10" width="${batteryWidth}" height="${batteryHeight}" rx="4" fill="none" stroke="${outlineColor}" stroke-width="3"/>
  <rect x="8" y="5" width="12" height="6" rx="2" fill="${outlineColor}"/>
  <rect x="5" y="${14 + batteryFillHeight - leftFill}" width="${batteryWidth - 6}" height="${leftFill}" rx="2" fill="${leftFillColor}"/>
  <rect x="34" y="10" width="${batteryWidth}" height="${batteryHeight}" rx="4" fill="none" stroke="${outlineColor}" stroke-width="3"/>
  <rect x="40" y="5" width="12" height="6" rx="2" fill="${outlineColor}"/>
  <rect x="37" y="${14 + batteryFillHeight - rightFill}" width="${batteryWidth - 6}" height="${rightFill}" rx="2" fill="${rightFillColor}"/>
</svg>`;
}

/**
 * Create battery icon
 */
async function createBatteryIcon(leftLevel: number | null, rightLevel: number | null): Promise<NativeImage> {
  const svg = createSvgContent(leftLevel, rightLevel);
  
  // Try sharp first
  if (sharp) {
    try {
      const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
      const img = nativeImage.createFromBuffer(pngBuffer);
      if (!img.isEmpty()) {
        return img;
      }
    } catch (e) {
      console.error('Sharp conversion failed:', e);
    }
  }
  
  // Fallback: try writing to file and loading
  try {
    const svgPath = path.join(tmpDir, 'icon.svg');
    fs.writeFileSync(svgPath, svg);
    
    if (sharp) {
      const pngPath = path.join(tmpDir, 'icon.png');
      await sharp(svgPath).png().toFile(pngPath);
      const img = nativeImage.createFromPath(pngPath);
      if (!img.isEmpty()) {
        return img;
      }
    }
  } catch (e) {
    console.error('File-based icon creation failed:', e);
  }
  
  // Final fallback: use bundled icon
  return getBundledIcon();
}

/**
 * Get bundled icon as fallback
 */
function getBundledIcon(): NativeImage {
  // Try to load from assets directory
  const possiblePaths = [
    path.join(__dirname, '..', 'assets', 'icon.png'),
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    path.join(app.getAppPath(), 'assets', 'icon.png'),
    path.join(process.resourcesPath || '', 'assets', 'icon.png'),
  ];
  
  for (const iconPath of possiblePaths) {
    try {
      if (fs.existsSync(iconPath)) {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) {
          console.log('Using bundled icon from:', iconPath);
          return img;
        }
      }
    } catch (e) {
      // Continue to next path
    }
  }
  
  // Create a minimal icon programmatically
  console.log('Creating minimal fallback icon');
  return createMinimalIcon();
}

/**
 * Create a minimal 16x16 icon programmatically
 */
function createMinimalIcon(): NativeImage {
  // Create a simple 16x16 PNG with two green rectangles
  const width = 16;
  const height = 16;
  const channels = 4; // RGBA
  
  const buffer = Buffer.alloc(width * height * channels);
  
  // Fill with transparent
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 0;     // R
    buffer[i + 1] = 0; // G
    buffer[i + 2] = 0; // B
    buffer[i + 3] = 0; // A (transparent)
  }
  
  // Draw two green battery rectangles
  const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = (y * width + x) * channels;
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = 255;
    }
  };
  
  // Left battery (green)
  for (let y = 2; y < 14; y++) {
    for (let x = 1; x < 7; x++) {
      setPixel(x, y, 68, 204, 68);
    }
  }
  
  // Right battery (green)
  for (let y = 2; y < 14; y++) {
    for (let x = 9; x < 15; x++) {
      setPixel(x, y, 68, 204, 68);
    }
  }
  
  return nativeImage.createFromBuffer(buffer, { width, height });
}

/**
 * Create default icon
 */
function createDefaultIcon(): NativeImage {
  // Try bundled icon first
  const bundled = getBundledIcon();
  if (!bundled.isEmpty()) {
    return bundled;
  }
  return createMinimalIcon();
}

/**
 * Update the tray icon and tooltip
 */
async function updateTray(): Promise<void> {
  if (!tray) return;

  const { left, right } = currentLevels;
  
  try {
    const icon = await createBatteryIcon(left, right);
    if (!icon.isEmpty()) {
      tray.setImage(icon);
    }
  } catch (e) {
    console.error('Failed to update tray icon:', e);
  }

  const leftStr = left !== null ? `${left}%` : 'N/A';
  const rightStr = right !== null ? `${right}%` : 'N/A';
  tray.setToolTip(`ZMK Battery\nLeft: ${leftStr}\nRight: ${rightStr}`);

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
    
    batteryReader.startPolling(POLL_INTERVAL, (levels) => {
      currentLevels = levels;
      updateTray();
    });
  } else {
    console.log('Failed to connect to ZMK device');
    currentLevels = { left: null, right: null, timestamp: new Date() };
    updateTray();
    
    setTimeout(tryConnect, 10000);
  }
}

/**
 * Initialize the application
 */
async function createTray(): Promise<void> {
  const icon = createDefaultIcon();
  
  console.log(`Default icon: ${icon.getSize().width}x${icon.getSize().height}, empty=${icon.isEmpty()}`);
  
  tray = new Tray(icon);
  tray.setToolTip('ZMK Battery Tray - Initializing...');

  updateContextMenu();
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
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});
