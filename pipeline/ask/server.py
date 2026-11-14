"""Local server: the dashboard plus live questions to the local LLM.

Serves web/ and answers POST /api/ask {"question": "..."} with Ollama running
on the same machine. Nothing leaves the computer. data/site.json is built in
memory from data/, so no separate build step is needed.

Usage:
    ollama pull mistral-nemo
    python -m pipeline.ask.server            # http://localhost:8000
    python -m pipeline.ask.server --port 8080 --model ministral-3:3b
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

from pipeline.ask import assistant
from pipeline.ask.knowledge import Knowledge

WEB = Path(__file__).resolve().parents[2] / "web"


class Handler(SimpleHTTPRequestHandler):
    kb: Knowledge
    model: str
    lock = Lock()  # one generation at a time: the model is the bottleneck

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/health":
            return self._json(200, {"ok": assistant.available(self.model), "model": self.model})
        if path == "/data/site.json":
            return self._json(200, self.kb.site)
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/ask":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            question = (json.loads(self.rfile.read(length) or b"{}").get("question") or "").strip()
        except (ValueError, AttributeError):
            return self._json(400, {"error": "send JSON {\"question\": \"...\"}"})
        if not question or len(question) > 500:
            return self._json(400, {"error": "question must be 1–500 characters"})
        try:
            with self.lock:
                return self._json(200, assistant.ask(self.kb, question, self.model))
        except urllib.error.URLError as e:
            return self._json(503, {"error": f"Ollama not reachable at {assistant.OLLAMA}: {e.reason}"})

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            super().log_message(fmt, *args)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--model", default=assistant.DEFAULT_MODEL)
    args = ap.parse_args(argv)
    Handler.kb, Handler.model = Knowledge(), args.model
    if not assistant.available(args.model):
        print(f"Warning: Ollama or model '{args.model}' not available; run `ollama pull {args.model}`. "
              "The dashboard works, questions will fail.", file=sys.stderr)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(WEB)))
    print(f"Dashboard and assistant on http://localhost:{args.port}/#/ask  (model {args.model}, Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
