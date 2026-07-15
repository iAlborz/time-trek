#!/usr/bin/env bash
# Serves TimeTrek locally and opens it in a browser.
#
# The app is plain HTML/CSS/JS with no build step, but it loads its JavaScript as
# ES modules — and browsers refuse to load modules over file://, so opening
# index.html directly will not work. Hence the tiny local server.
#
# macOS users: double-click "Start TimeTrek.command" instead of running this.

set -u
cd "$(dirname "$0")" || exit 1

URL_PATH="projects.html"

# --- pick a port that's actually free -----------------------------------------
PORT=""
for candidate in $(seq 8000 8010); do
    if ! nc -z localhost "$candidate" >/dev/null 2>&1; then
        PORT="$candidate"
        break
    fi
done

if [ -z "$PORT" ]; then
    echo "Ports 8000-8010 are all in use. Close whatever is using them and try again."
    exit 1
fi

# --- pick whichever static file server this machine already has ---------------
if command -v python3 >/dev/null 2>&1; then
    SERVER=(python3 -m http.server "$PORT")
    USING="Python"
elif command -v ruby >/dev/null 2>&1; then
    SERVER=(ruby -run -e httpd . -p "$PORT")
    USING="Ruby"
elif command -v npx >/dev/null 2>&1; then
    SERVER=(npx --yes serve -l "$PORT")
    USING="Node"
else
    echo
    echo "  TimeTrek needs Python, Ruby, or Node to serve the files locally."
    echo "  The easiest fix is to install Python: https://www.python.org/downloads/"
    echo "  Then double-click this file again."
    echo
    exit 1
fi

URL="http://localhost:$PORT/$URL_PATH"

echo
echo "  TimeTrek is starting ($USING, port $PORT)"
echo "  $URL"
echo
echo "  Leave this window open while you use the app."
echo "  Close it, or press Ctrl-C, to stop."
echo

"${SERVER[@]}" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID >/dev/null 2>&1' EXIT INT TERM

# Wait for the server to accept connections before opening the browser, so the
# first request doesn't land on a closed port and show an error page.
for _ in $(seq 1 40); do
    if nc -z localhost "$PORT" >/dev/null 2>&1; then
        break
    fi
    sleep 0.25
done

if ! kill -0 $SERVER_PID >/dev/null 2>&1; then
    echo "  The server failed to start. Try running this from a terminal to see why."
    exit 1
fi

if command -v open >/dev/null 2>&1; then
    open "$URL"            # macOS
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL"        # Linux
else
    echo "  Couldn't open a browser automatically — visit the URL above."
fi

wait $SERVER_PID
