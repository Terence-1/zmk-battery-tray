/**
 * ZMK Battery Tray - Main Electron Process
 * System tray application for monitoring ZMK split keyboard battery levels
 */

import { app, Tray, Menu, nativeImage, NativeImage, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ZMKBatteryReader, BatteryLevels } from './battery-reader';

// Disable sandbox on Linux (required for development without root permissions)
app.commandLine.appendSwitch('no-sandbox');

// Prevent garbage collection of tray
let tray: Tray | null = null;
let batteryReader: ZMKBatteryReader | null = null;
let currentLevels: BatteryLevels = { left: null, right: null, timestamp: new Date() };

// Polling interval in milliseconds (1 minute)
const POLL_INTERVAL = 60000;

/**
 * Convert battery percentage to level bucket (0-4)
 * 0 = null/empty, 1 = critical (1-10%), 2 = low (11-25%), 3 = medium (26-50%), 4 = good (51-100%)
 */
function getLevelBucket(percent: number | null): number {
  if (percent === null || percent === 0) return 0;
  if (percent <= 10) return 1;
  if (percent <= 25) return 2;
  if (percent <= 50) return 3;
  return 4;
}

/**
 * Get pre-generated icon path
 */
function getIconPath(leftLevel: number | null, rightLevel: number | null): string {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  const leftBucket = getLevelBucket(leftLevel);
  const rightBucket = getLevelBucket(rightLevel);
  const filename = `battery_${theme}_${leftBucket}_${rightBucket}.png`;
  
  // Try different paths for dev vs packaged
  const possiblePaths = [
    path.join(__dirname, '..', 'assets', 'icons', filename),
    path.join(__dirname, '..', '..', 'assets', 'icons', filename),
    path.join(app.getAppPath(), 'assets', 'icons', filename),
  ];
  
  for (const iconPath of possiblePaths) {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }
  
  // Return first path even if doesn't exist (will trigger fallback)
  return possiblePaths[0];
}

/**
 * Get battery icon for current levels
 */
function getBatteryIcon(leftLevel: number | null, rightLevel: number | null): NativeImage {
  const iconPath = getIconPath(leftLevel, rightLevel);
  
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      return img;
    }
  }
  
  console.log('Pre-generated icon not found:', iconPath);
  return getFallbackIcon();
}

/**
 * Get fallback icon (bundled app icon)
 */
function getFallbackIcon(): NativeImage {
  const possiblePaths = [
    path.join(__dirname, '..', 'assets', 'icon.png'),
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    path.join(app.getAppPath(), 'assets', 'icon.png'),
  ];
  
  for (const iconPath of possiblePaths) {
    if (fs.existsSync(iconPath)) {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        console.log('Using fallback icon from:', iconPath);
        return img;
      }
    }
  }
  
  console.log('No fallback icon found, creating minimal icon');
  return createMinimalIcon();
}

/**
 * Create a minimal 16x16 icon programmatically
 */
function createMinimalIcon(): NativeImage {
  const width = 16;
  const height = 16;
  const channels = 4;
  
  const buffer = Buffer.alloc(width * height * channels);
  
  const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = (y * width + x) * channels;
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = 255;
    }
  };
  
  // Draw two green battery rectangles
  for (let y = 2; y < 14; y++) {
    for (let x = 1; x < 7; x++) setPixel(x, y, 68, 204, 68);
    for (let x = 9; x < 15; x++) setPixel(x, y, 68, 204, 68);
  }
  
  return nativeImage.createFromBuffer(buffer, { width, height });
}

/**
 * Update the tray icon and tooltip
 */
function updateTray(): void {
  if (!tray) return;

  const { left, right } = currentLevels;
  
  const icon = getBatteryIcon(left, right);
  if (!icon.isEmpty()) {
    tray.setImage(icon);
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
function createTray(): void {
  const icon = getBatteryIcon(null, null);
  
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
});
