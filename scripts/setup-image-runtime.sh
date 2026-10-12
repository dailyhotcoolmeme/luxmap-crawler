#!/bin/sh
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
RUNTIME_DIR="$PROJECT_DIR/.image-runtime"
PYTHON=${LUXURY_SETUP_PYTHON:-python3.11}
mkdir -p "$RUNTIME_DIR"
if [ ! -x "$RUNTIME_DIR/venv/bin/python" ]; then
 "$PYTHON" -m venv "$RUNTIME_DIR/venv"
fi
"$RUNTIME_DIR/venv/bin/python" -m pip install --disable-pip-version-check --no-deps -r "$PROJECT_DIR/crawler/common/cutout-requirements.txt" > /dev/null 2>&1
MODEL="$RUNTIME_DIR/u2net.onnx"
if [ ! -f "$MODEL" ]; then
 if [ -f "$HOME/.u2net/u2net.onnx" ]; then
  cp "$HOME/.u2net/u2net.onnx" "$MODEL"
 else
  curl --fail --silent --show-error --location --max-time 300 --output "$MODEL.download" 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx'
  mv "$MODEL.download" "$MODEL"
 fi
fi
[ "$(shasum -a 256 "$MODEL" | cut -d ' ' -f 1)" = '8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491' ] || { echo 'FAILED: MODEL_CHECKSUM'; exit 78; }
env -i PATH="$PATH" /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network*)' "$RUNTIME_DIR/venv/bin/python" -I "$PROJECT_DIR/crawler/common/cutout-worker.py" "$MODEL" < /dev/null > /dev/null
echo 'PASS: pinned CPU image runtime and network denial verified'
