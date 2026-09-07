#!/bin/bash
# Cài đặt an toàn cho Radar.
#
# Bộ giải nén của Electron không hợp với Node mới trên một số máy: nó bung
# thiếu file rồi im lặng, và `npm start` báo "Library not loaded".
# Script này bỏ qua bộ đó, dùng ditto của macOS.
#
# Chạy lại bao nhiêu lần cũng được, chỉ sửa cái đang thiếu.

set -e
cd "$(dirname "$0")"

EV=$(node -p "require('./package.json').devDependencies.electron.replace(/[^0-9.]/g,'')")
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLAT=darwin-arm64; BIN="Electron.app/Contents/MacOS/Electron"; CHECK="dist/Electron.app/Contents/Frameworks/Electron Framework.framework" ;;
  Darwin-x86_64) PLAT=darwin-x64;  BIN="Electron.app/Contents/MacOS/Electron"; CHECK="dist/Electron.app/Contents/Frameworks/Electron Framework.framework" ;;
  *) echo "Script này chỉ dùng cho macOS. Trên Windows chạy: npm install"; exit 1 ;;
esac

echo "Radar — cài đặt"
echo "  Electron $EV ($PLAT)"
echo ""

# 1. Các gói khác. --ignore-scripts để npm không chạm vào Electron.
if [ ! -d node_modules ] || [ ! -d node_modules/electron-builder ]; then
  echo "→ Cài các gói phụ thuộc..."
  npm install --ignore-scripts --no-audit --no-fund
else
  echo "✓ node_modules đã có"
fi

# 2. Bản chạy Electron. Kiểm tra Frameworks, không chỉ kiểm tra thư mục tồn tại —
#    bung hỏng vẫn để lại Electron.app nhưng thiếu phần lõi.
if [ -e "node_modules/electron/$CHECK" ] && [ -f node_modules/electron/path.txt ]; then
  echo "✓ Electron đã đầy đủ"
else
  echo "→ Tải Electron $EV (khoảng 105 MB)..."
  ZIP="/tmp/electron-v$EV-$PLAT.zip"
  [ -f "$ZIP" ] || curl -fL --progress-bar -o "$ZIP" \
    "https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-$PLAT.zip"

  echo "→ Bung bằng ditto..."
  rm -rf node_modules/electron/dist
  mkdir -p node_modules/electron/dist
  ditto -x -k "$ZIP" node_modules/electron/dist
  printf '%s' "$BIN" > node_modules/electron/path.txt
  printf '%s' "$EV" > node_modules/electron/dist/version

  if [ ! -e "node_modules/electron/$CHECK" ]; then
    echo "✗ Bung vẫn thiếu Frameworks. Xoá $ZIP rồi chạy lại script."
    exit 1
  fi
  echo "✓ Electron đã sẵn sàng"
fi

echo ""
echo "Xong. Chạy app:  npm start"
