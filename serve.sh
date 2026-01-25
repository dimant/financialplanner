#!/bin/bash

# Simple static file server for macOS/Linux
# Usage: ./serve.sh

PORT=8000
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="${1:-.}"
if [[ "$DIR" != /* ]]; then
    DIR="$SCRIPT_DIR/$DIR"
fi

echo "Serving files from $DIR"
echo "Serving HTTP on http://localhost:$PORT/"

# Use Python's built-in HTTP server if available, otherwise use nc
if command -v python3 &> /dev/null; then
    cd "$DIR"
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    cd "$DIR"
    python -m SimpleHTTPServer $PORT
else
    # Fallback: simple bash server using nc (netcat)
    while true; do
        {
            read -r method path protocol
            path=${path#/}
            [[ -z "$path" ]] && path="index.html"
            
            fullpath="$DIR/$path"
            
            if [[ -f "$fullpath" ]]; then
                case "$path" in
                    *.html) echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r" ;;
                    *.css)  echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/css\r\n\r" ;;
                    *.js)   echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/javascript\r\n\r" ;;
                    *)      echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\n\r" ;;
                esac
                cat "$fullpath"
            else
                echo -e "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n\r"
                echo "404 Not Found"
            fi
        } | nc -l localhost $PORT
    done
fi
