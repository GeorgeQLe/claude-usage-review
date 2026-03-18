#!/bin/bash
# claudeusage.sh — build, start, stop, restart ClaudeUsage menu bar app

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DERIVED_DATA="$HOME/Library/Developer/Xcode/DerivedData"
APP_NAME="ClaudeUsage"
SCHEME="ClaudeUsage"
RELEASE_DIR="$PROJECT_DIR/release"

# Find the built .app in DerivedData
find_app() {
    local app
    app=$(find "$DERIVED_DATA" -path "*/$APP_NAME-*/Build/Products/Release/$APP_NAME.app" -maxdepth 6 2>/dev/null | head -1)
    echo "$app"
}

cmd_build() {
    echo "Building $APP_NAME (Release)..."
    xcodebuild -scheme "$SCHEME" -destination 'platform=macOS' \
        -configuration Release build 2>&1 | grep -E '^\*\*|error:'

    local app
    app=$(find_app)
    if [ -z "$app" ]; then
        echo "Error: build output not found"
        exit 1
    fi

    # Copy to release/
    mkdir -p "$RELEASE_DIR"
    rm -rf "$RELEASE_DIR/$APP_NAME.app"
    cp -R "$app" "$RELEASE_DIR/$APP_NAME.app"
    echo "Copied to $RELEASE_DIR/$APP_NAME.app"
}

cmd_start() {
    if pgrep -x "$APP_NAME" > /dev/null 2>&1; then
        echo "$APP_NAME is already running (pid $(pgrep -x "$APP_NAME"))"
        return 0
    fi

    local app="$RELEASE_DIR/$APP_NAME.app"
    if [ ! -d "$app" ]; then
        echo "No release build found. Run '$0 build' first."
        exit 1
    fi

    echo "Starting $APP_NAME..."
    open "$app"
    echo "$APP_NAME started"
}

cmd_stop() {
    if ! pgrep -x "$APP_NAME" > /dev/null 2>&1; then
        echo "$APP_NAME is not running"
        return 0
    fi

    echo "Stopping $APP_NAME..."
    pkill -x "$APP_NAME"
    echo "$APP_NAME stopped"
}

cmd_restart() {
    cmd_stop
    sleep 0.5
    cmd_start
}

cmd_status() {
    if pgrep -x "$APP_NAME" > /dev/null 2>&1; then
        echo "$APP_NAME is running (pid $(pgrep -x "$APP_NAME"))"
    else
        echo "$APP_NAME is not running"
    fi
}

cmd_deploy() {
    cmd_build
    cmd_stop 2>/dev/null || true
    sleep 0.5
    cmd_start
}

usage() {
    echo "Usage: $0 {start|stop|restart|build|deploy|status}"
    echo ""
    echo "  start    — launch the app (from release/)"
    echo "  stop     — kill the running app"
    echo "  restart  — stop + start"
    echo "  build    — build Release and copy to release/"
    echo "  deploy   — build, stop old, start new"
    echo "  status   — check if running"
}

case "${1:-}" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_restart ;;
    build)   cmd_build ;;
    deploy)  cmd_deploy ;;
    status)  cmd_status ;;
    *)       usage; exit 1 ;;
esac
