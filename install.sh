#!/bin/bash
# ZMK Battery Tray Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Terence-1/zmk-battery-tray/main/install.sh | bash

set -e

REPO="Terence-1/zmk-battery-tray"
TMP_DIR=$(mktemp -d)

echo "=== ZMK Battery Tray Installer ==="
echo

# Get latest release URL
echo "Fetching latest release..."
DEB_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"browser_download_url":\s*"[^"]*\.deb"' | cut -d'"' -f4)

if [ -z "$DEB_URL" ]; then
    echo "Error: Could not find .deb in latest release"
    echo "Trying local file..."
    if [ -f "./release/zmk-battery-tray_1.0.0_amd64.deb" ]; then
        DEB_FILE="./release/zmk-battery-tray_1.0.0_amd64.deb"
    else
        echo "No local file found either. Exiting."
        exit 1
    fi
else
    DEB_FILE="$TMP_DIR/zmk-battery-tray.deb"
    echo "Downloading: $DEB_URL"
    curl -fsSL -o "$DEB_FILE" "$DEB_URL"
fi

# Install .deb
echo "Installing package..."
sudo dpkg -i "$DEB_FILE" || sudo apt-get install -f -y

# Setup udev rules for HID access
UDEV_RULE='SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1d50", ATTRS{idProduct}=="615e", MODE="0666"'
UDEV_FILE="/etc/udev/rules.d/99-zmk.rules"

if [ ! -f "$UDEV_FILE" ] || ! grep -q "1d50" "$UDEV_FILE" 2>/dev/null; then
    echo "Setting up udev rules for HID access..."
    echo "$UDEV_RULE" | sudo tee "$UDEV_FILE" > /dev/null
    sudo udevadm control --reload-rules
    sudo udevadm trigger
fi

# Refresh icon cache
echo "Refreshing icon cache..."
sudo gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true

# Cleanup
rm -rf "$TMP_DIR"

echo
echo "=== Installation complete! ==="
echo
echo "You can now:"
echo "  - Launch from your application menu (search 'zmk')"
echo "  - Or run: zmk-battery-tray"
echo
echo "Note: If the app doesn't detect your keyboard, unplug and replug it."
