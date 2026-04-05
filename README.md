# ZMK Battery Tray

A system tray application for monitoring ZMK split keyboard battery levels over USB HID.

> **Note:** This application was built with the assistance of AI (Claude).

## Features

- Shows battery levels for both halves of a split keyboard in the system tray
- Dynamic battery fill visualization (shows exact percentage like a phone)
- Color-coded battery indicators:
  - Green: >50%
  - Yellow: 26-50%
  - Orange: 11-25%
  - Red: ≤10%
  - Gray: Not connected
- Theme-aware icons (adapts to system light/dark mode)
- Automatic device detection and reconnection
- Polls battery levels every 60 seconds
- **Auto-update support** - automatically checks for and installs updates
- **Swap left/right sides** - configurable option to fix incorrect side reporting (when peripherals connect in the wrong order)

## Requirements

This application works with keyboards running ZMK firmware with the [zmk-usb-reporting](https://github.com/Terence-1/zmk-usb-reporting) module enabled.

### Firmware Configuration

Your ZMK dongle must have:

```ini
CONFIG_ZMK_USB_HID_BATTERY_REPORTING=y
CONFIG_ZMK_USB_HID_BATTERY_REPORTING_SPLIT=y
CONFIG_USB_HID_DEVICE_COUNT=2
CONFIG_ZMK_SPLIT_BLE_CENTRAL_BATTERY_LEVEL_FETCHING=y
CONFIG_BT_BAS=y
```

Your peripherals must have:

```ini
CONFIG_ZMK_BATTERY_REPORTING=y
CONFIG_BT_BAS=y
```

## Install & Build

```bash
# Install dependencies
bun install

# Run locally (rebuilds TypeScript first)
bun start

# Hot reload during development
bun run dev

# Produce a Linux AppImage in release/
bun run package
```

## Usage

1. Connect your ZMK keyboard via USB
2. Run the application
3. The tray icon will show battery levels for both halves
4. Hover over the icon to see exact percentages
5. Right-click for menu options:
   - View battery levels and connection status
   - **Swap Left/Right Sides** - toggle if sides are reporting incorrectly
   - Refresh manually
   - Reconnect device
   - **Check for Updates** - manually check for new versions
   - Quit

### Fixing Wrong Side Reporting

If the left and right battery levels are swapped (due to Bluetooth connection order), you can fix this without reflashing firmware:

1. Right-click the tray icon
2. Check **"Swap Left/Right Sides"**
3. The setting is saved automatically and persists across restarts

## Linux Notes

On Linux, you may need to set up udev rules to allow access to the HID device without root:

```bash
# /etc/udev/rules.d/99-zmk.rules
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1d50", ATTRS{idProduct}=="615e", MODE="0666"
```

Then reload udev:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

## License

MIT
