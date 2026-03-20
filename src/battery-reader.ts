/**
 * ZMK Battery HID Reader
 * Reads battery levels from ZMK USB HID device
 */

import HID from 'node-hid';

// ZMK USB HID Battery Report IDs
const BATTERY_REPORT_ID_LEFT = 0x05;
const BATTERY_REPORT_ID_RIGHT = 0x06;

// ZMK default USB IDs (can be customized)
const ZMK_VENDOR_ID = 0x1d50;  // OpenMoko
const ZMK_PRODUCT_ID = 0x615e; // ZMK default

// Battery HID is on interface 3 (HID_1)
const BATTERY_INTERFACE = 3;

export interface BatteryLevels {
  left: number | null;
  right: number | null;
  timestamp: Date;
}

export interface ZMKDevice {
  path: string;
  vendorId: number;
  productId: number;
  product?: string;
  manufacturer?: string;
  interface?: number;
}

export class ZMKBatteryReader {
  private device: HID.HID | null = null;
  private devicePath: string | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastLevels: BatteryLevels = { left: null, right: null, timestamp: new Date() };
  private onUpdateCallback: ((levels: BatteryLevels) => void) | null = null;

  /**
   * Find ZMK battery HID device (interface 3)
   */
  static findBatteryDevice(): ZMKDevice | null {
    const devices = HID.devices();
    
    // Find the ZMK device on interface 3 (battery HID)
    for (const device of devices) {
      if (device.path && 
          device.vendorId === ZMK_VENDOR_ID && 
          device.productId === ZMK_PRODUCT_ID &&
          device.interface === BATTERY_INTERFACE) {
        console.log(`Found ZMK battery HID: ${device.path} (interface ${device.interface})`);
        return {
          path: device.path,
          vendorId: device.vendorId,
          productId: device.productId,
          product: device.product,
          manufacturer: device.manufacturer,
          interface: device.interface,
        };
      }
    }

    // Fallback: try any ZMK device
    for (const device of devices) {
      if (device.path && 
          device.vendorId === ZMK_VENDOR_ID && 
          device.productId === ZMK_PRODUCT_ID) {
        console.log(`Found ZMK device (fallback): ${device.path} (interface ${device.interface})`);
        return {
          path: device.path,
          vendorId: device.vendorId,
          productId: device.productId,
          product: device.product,
          manufacturer: device.manufacturer,
          interface: device.interface,
        };
      }
    }

    return null;
  }

  /**
   * List all ZMK devices for debugging
   */
  static listAllDevices(): void {
    const devices = HID.devices();
    console.log('All HID devices:');
    for (const device of devices) {
      if (device.vendorId === ZMK_VENDOR_ID) {
        console.log(`  ${device.path}: interface=${device.interface}, usagePage=${device.usagePage}, usage=${device.usage}`);
      }
    }
  }

  /**
   * Connect to a ZMK battery HID device
   */
  connect(devicePath?: string): boolean {
    try {
      // List devices for debugging
      ZMKBatteryReader.listAllDevices();

      if (devicePath) {
        this.device = new HID.HID(devicePath);
        this.devicePath = devicePath;
        console.log(`Connected to specified path: ${devicePath}`);
      } else {
        // Find the battery HID device
        const batteryDevice = ZMKBatteryReader.findBatteryDevice();
        if (!batteryDevice) {
          console.error('No ZMK battery device found');
          return false;
        }
        
        try {
          this.device = new HID.HID(batteryDevice.path);
          this.devicePath = batteryDevice.path;
          console.log(`Connected to: ${batteryDevice.product || batteryDevice.path} (interface ${batteryDevice.interface})`);
        } catch (e) {
          console.error(`Failed to open device ${batteryDevice.path}:`, e);
          return false;
        }
      }

      if (!this.device) {
        return false;
      }

      this.device.on('error', (err) => {
        console.error('HID device error:', err);
        this.disconnect();
      });

      return true;
    } catch (err) {
      console.error('Failed to connect:', err);
      return false;
    }
  }

  /**
   * Disconnect from the device
   */
  disconnect(): void {
    this.stopPolling();
    if (this.device) {
      try {
        this.device.close();
      } catch (e) {
        // Ignore close errors
      }
      this.device = null;
      this.devicePath = null;
    }
  }

  /**
   * Read battery level for a specific report ID
   */
  private readBatteryReport(reportId: number): number | null {
    if (!this.device) {
      return null;
    }

    try {
      // Request input report with report ID
      // The report format is: [report_id, battery_level]
      const data = this.device.getFeatureReport(reportId, 2);
      if (data && data.length >= 2) {
        console.log(`Report ${reportId}: got ${data[0]}, ${data[1]}`);
        return data[1];
      }
    } catch (e: any) {
      console.log(`getFeatureReport(${reportId}) failed: ${e.message}`);
    }

    return null;
  }

  /**
   * Read both battery levels
   */
  readBatteryLevels(): BatteryLevels {
    const left = this.readBatteryReport(BATTERY_REPORT_ID_LEFT);
    const right = this.readBatteryReport(BATTERY_REPORT_ID_RIGHT);
    
    console.log(`Battery levels: left=${left}%, right=${right}%`);
    
    this.lastLevels = {
      left,
      right,
      timestamp: new Date(),
    };

    return this.lastLevels;
  }

  /**
   * Get the last read battery levels
   */
  getLastLevels(): BatteryLevels {
    return this.lastLevels;
  }

  /**
   * Start polling for battery updates
   */
  startPolling(intervalMs: number = 60000, callback?: (levels: BatteryLevels) => void): void {
    if (callback) {
      this.onUpdateCallback = callback;
    }

    // Read immediately
    const levels = this.readBatteryLevels();
    if (this.onUpdateCallback) {
      this.onUpdateCallback(levels);
    }

    // Then poll at interval
    this.pollInterval = setInterval(() => {
      if (this.device) {
        const levels = this.readBatteryLevels();
        if (this.onUpdateCallback) {
          this.onUpdateCallback(levels);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.device !== null;
  }
}
