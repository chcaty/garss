"""Serve the PWA locally with predictable module MIME types on Windows."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / "docs"
    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript"}
    with ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(root))) as server:
        print(f"Preview: http://127.0.0.1:{args.port}/review.html", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
