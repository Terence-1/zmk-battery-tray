# ZMK Battery Tray

A system tray application for monitoring ZMK split keyboard battery levels over USB HID.

## Features

- Shows battery levels for both halves of a split keyboard in the system tray
- Color-coded icons:
  - Green: >50%
  - Yellow: 26-50%
  - Orange: 11-25%
  - Red: ≤10%
  - Gray: Not connected
- Automatic device detection and reconnection
- Polls battery levels every 60 seconds

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

## Installation

### From Source

```bash
# Install dependencies
npm install

# Build and run
npm start

# Or for development
npm run dev
```

### Building Releases

```bash
# Build for current platform
npm run package

# Build for specific platforms
npm run package:linux
npm run package:win
npm run package:mac
```

## Usage

1. Connect your ZMK keyboard via USB
2. Run the application
3. The tray icon will show battery levels for both halves
4. Hover over the icon to see exact percentages
5. Right-click for menu options:
   - View battery levels
   - Refresh manually
   - Reconnect device
   - Quit

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
