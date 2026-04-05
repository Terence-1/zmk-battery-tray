/**
 * ZMK Battery Tray - Main Electron Process
 * System tray application for monitoring ZMK split keyboard battery levels
 * 
 * Uses Sharp to dynamically generate battery icons at runtime, similar to
 * how phones display battery levels with smooth fill indicators.
 */

import { app, Tray, Menu, nativeImage, NativeImage, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import { ZMKBatteryReader, BatteryLevels } from './battery-reader';
import { autoUpdater } from 'electron-updater';

// Settings file path
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

interface Settings {
  swapSides: boolean;
}

// Load settings from file
function loadSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return { swapSides: false };
}

// Save settings to file
function saveSettings(settings: Settings): void {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Current settings
let settings: Settings = loadSettings();

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater state
let updateAvailable = false;
let updateDownloaded = false;
let updateVersion = '';

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  updateAvailable = true;
  updateVersion = info.version;
  updateContextMenu();
});

autoUpdater.on('update-not-available', () => {
  console.log('No updates available');
  updateAvailable = false;
  updateContextMenu();
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err);
  updateAvailable = false;
  updateContextMenu();
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download progress: ${progressObj.percent.toFixed(1)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  updateDownloaded = true;
  updateContextMenu();
});

// Disable sandbox on Linux (required for development without root permissions)
app.commandLine.appendSwitch('no-sandbox');

// Prevent garbage collection of tray
let tray: Tray | null = null;
let batteryReader: ZMKBatteryReader | null = null;
let currentLevels: BatteryLevels = { left: null, right: null, timestamp: new Date() };

// Polling interval in milliseconds (1 minute)
const POLL_INTERVAL = 60000;

// Icon dimensions
const ICON_SIZE = 22; // Standard tray icon size for Linux
const BATTERY_WIDTH = 8;
const BATTERY_HEIGHT = 16;
const BATTERY_GAP = 4;
const TERMINAL_HEIGHT = 2;

// Cache for generated icons
const iconCache = new Map<string, NativeImage>();

/**
 * Get color for battery level (smooth gradient like phone)
 * Green (>50%) -> Yellow (26-50%) -> Orange (11-25%) -> Red (<=10%)
 */
function getBatteryColor(percent: number | null): string {
  if (percent === null) return '#808080'; // Gray for unknown
  if (percent <= 10) return '#FF4444'; // Red - critical
  if (percent <= 25) return '#FF8C00'; // Orange - low
  if (percent <= 50) return '#FFD700'; // Yellow - medium
  return '#44CC44'; // Green - good
}

/**
 * Generate SVG for a single battery with smooth fill
 */
function generateBatterySVG(
  x: number,
  percent: number | null,
  outlineColor: string
): string {
  const fillColor = getBatteryColor(percent);
  const fillPercent = percent ?? 0;
  
  // Battery body dimensions
  const bodyY = TERMINAL_HEIGHT;
  const bodyHeight = BATTERY_HEIGHT - TERMINAL_HEIGHT;
  
  // Fill height based on percentage (from bottom up)
  const maxFillHeight = bodyHeight - 2; // 1px padding top and bottom
  const fillHeight = Math.round((fillPercent / 100) * maxFillHeight);
  const fillY = bodyY + 1 + (maxFillHeight - fillHeight);
  
  // Terminal (top nub)
  const terminalWidth = 4;
  const terminalX = x + (BATTERY_WIDTH - terminalWidth) / 2;
  
  let svg = '';
  
  // Terminal (top nub)
  svg += `<rect x="${terminalX}" y="0" width="${terminalWidth}" height="${TERMINAL_HEIGHT}" fill="${outlineColor}" rx="0.5"/>`;
  
  // Battery body outline
  svg += `<rect x="${x}" y="${bodyY}" width="${BATTERY_WIDTH}" height="${bodyHeight}" fill="none" stroke="${outlineColor}" stroke-width="1.5" rx="1"/>`;
  
  // Battery fill (if any)
  if (fillPercent > 0) {
    svg += `<rect x="${x + 1}" y="${fillY}" width="${BATTERY_WIDTH - 2}" height="${fillHeight}" fill="${fillColor}" rx="0.5"/>`;
  }
  
  // X mark for disconnected
  if (percent === null) {
    const centerX = x + BATTERY_WIDTH / 2;
    const centerY = bodyY + bodyHeight / 2;
    const size = 3;
    svg += `<line x1="${centerX - size}" y1="${centerY - size}" x2="${centerX + size}" y2="${centerY + size}" stroke="${outlineColor}" stroke-width="1.5" stroke-linecap="round"/>`;
    svg += `<line x1="${centerX + size}" y1="${centerY - size}" x2="${centerX - size}" y2="${centerY + size}" stroke="${outlineColor}" stroke-width="1.5" stroke-linecap="round"/>`;
  }
  
  return svg;
}

/**
 * Generate complete battery icon SVG
 */
function generateIconSVG(leftPercent: number | null, rightPercent: number | null, isDark: boolean): string {
  const outlineColor = isDark ? '#FFFFFF' : '#000000';
  
  // Calculate positions to center both batteries
  const totalWidth = BATTERY_WIDTH * 2 + BATTERY_GAP;
  const startX = (ICON_SIZE - totalWidth) / 2;
  const startY = (ICON_SIZE - BATTERY_HEIGHT) / 2;
  
  const leftX = startX;
  const rightX = startX + BATTERY_WIDTH + BATTERY_GAP;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">
    <g transform="translate(0, ${startY})">
      ${generateBatterySVG(leftX, leftPercent, outlineColor)}
      ${generateBatterySVG(rightX, rightPercent, outlineColor)}
    </g>
  </svg>`;
}

/**
 * Generate battery icon using resvg-js
 */
function generateBatteryIcon(leftLevel: number | null, rightLevel: number | null): NativeImage {
  const isDark = nativeTheme.shouldUseDarkColors;
  const cacheKey = `${leftLevel ?? 'null'}_${rightLevel ?? 'null'}_${isDark}`;
  
  // Check cache first
  const cached = iconCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const svg = generateIconSVG(leftLevel, rightLevel, isDark);
    
    // Use resvg-js to convert SVG to PNG
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: ICON_SIZE,
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    const icon = nativeImage.createFromBuffer(pngBuffer);
    
    if (!icon.isEmpty()) {
      // Cache the result
      iconCache.set(cacheKey, icon);
      return icon;
    }
  } catch (error) {
    console.error('Error generating battery icon:', error);
  }
  
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
  
  try {
    const icon = generateBatteryIcon(left, right);
    if (!icon.isEmpty()) {
      tray.setImage(icon);
    }
  } catch (error) {
    console.error('Error updating tray icon:', error);
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

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
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
      label: 'Swap Left/Right Sides',
      type: 'checkbox',
      checked: settings.swapSides,
      click: () => {
        settings.swapSides = !settings.swapSides;
        saveSettings(settings);
        if (batteryReader) {
          batteryReader.setSwapSides(settings.swapSides);
          if (batteryReader.isConnected()) {
            currentLevels = batteryReader.readBatteryLevels();
            updateTray();
          }
        }
      },
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
  ];

  // Add update menu items if available
  if (updateDownloaded) {
    menuTemplate.push({ type: 'separator' });
    menuTemplate.push({
      label: `Install Update (${updateVersion}) and Restart`,
      click: () => {
        autoUpdater.quitAndInstall();
      },
    });
  } else if (updateAvailable) {
    menuTemplate.push({ type: 'separator' });
    menuTemplate.push({
      label: `Download Update (${updateVersion})`,
      click: () => {
        autoUpdater.downloadUpdate();
      },
    });
  }

  menuTemplate.push({ type: 'separator' });
  menuTemplate.push({
    label: 'Check for Updates',
    click: () => {
      autoUpdater.checkForUpdates();
    },
  });
  menuTemplate.push({ type: 'separator' });
  menuTemplate.push({
    label: 'Quit',
    click: () => {
      app.quit();
    },
  });

  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

// Reconnection timer
let reconnectTimer: NodeJS.Timeout | null = null;

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect(delayMs: number = 5000): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  console.log(`Scheduling reconnection in ${delayMs}ms...`);
  reconnectTimer = setTimeout(tryConnect, delayMs);
}

/**
 * Try to connect to ZMK device
 */
function tryConnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (batteryReader) {
    batteryReader.disconnect();
  }

  batteryReader = new ZMKBatteryReader();
  batteryReader.setSwapSides(settings.swapSides);
  
  if (batteryReader.connect(() => {
    // Called when device disconnects
    console.log('Device disconnected, will attempt to reconnect...');
    currentLevels = { left: null, right: null, timestamp: new Date() };
    updateTray();
    scheduleReconnect(5000);
  })) {
    console.log('Connected to ZMK device');
    
    batteryReader.startPolling(POLL_INTERVAL, (levels) => {
      currentLevels = levels;
      updateTray();
    });
  } else {
    console.log('Failed to connect to ZMK device');
    currentLevels = { left: null, right: null, timestamp: new Date() };
    updateTray();
    
    scheduleReconnect(10000);
  }
}

/**
 * Clear icon cache (called on theme change)
 */
function clearIconCache(): void {
  iconCache.clear();
}

/**
 * Initialize the application
 */
function createTray(): void {
  // Generate initial icon
  const icon = generateBatteryIcon(null, null);
  
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
  
  // Check for updates on startup (after a delay to let app settle)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('Failed to check for updates:', err);
    });
  }, 5000);
  
  nativeTheme.on('updated', () => {
    console.log('Theme changed, clearing cache and updating icon...');
    clearIconCache();
    updateTray();
  });
});

// Cleanup on quit
app.on('before-quit', () => {
  if (batteryReader) {
    batteryReader.disconnect();
  }
});
