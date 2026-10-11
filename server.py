#!/usr/bin/env python3
"""Recall Watch server — 127.0.0.1:4310. Serves live page + /api/recalls + /api/items."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 4310))


def rd(rel):
    with open(os.path.join(HERE, rel), encoding="utf-8") as f:
        return f.read()


def load_json(name, fallback):
    p = os.path.join(HERE, "data", name)
    if os.path.isfile(p):
        with open(p, encoding="utf-8") as f:
            return f.read()
    return json.dumps(fallback)


def page():
    items = load_json("items.json", {"items": []})
    recalls = load_json("recalls.json", {"mode": "demo", "matches": []})
    demo = load_json("demo-recalls.json", {"matches": []})
    payload = {
        "items": json.loads(items),
        "recalls": json.loads(recalls),
        "demo": json.loads(demo),
    }
    html = rd("web/index.html")
    html = html.replace("/*__CSS__*/", rd("web/app.css"))
    html = html.replace(
        "/*__DATA__*/ null /*__/DATA__*/", json.dumps(payload, ensure_ascii=False)
    )
    html = html.replace(
        "/*__APP__*/", rd("web/app.js").replace("</script", "<\\/script")
    )
    return html


class H(BaseHTTPRequestHandler):
    def send(self, code, body, ctype):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        path = self.path.split("?")[0]
        try:
            if path in ("/", "/index.html", "/recall-watch.html"):
                self.send(200, page(), "text/html; charset=utf-8")
            elif path == "/api/recalls":
                raw = load_json("recalls.json", None)
                if raw == "null" or raw is None:
                    self.send(
                        404,
                        json.dumps({"error": "recalls.json missing"}),
                        "application/json",
                    )
                    return
                # load_json returns string; if fallback None and missing, handle
                if not os.path.isfile(os.path.join(HERE, "data", "recalls.json")):
                    self.send(
                        404,
                        json.dumps({"error": "recalls.json missing"}),
                        "application/json",
                    )
                    return
                self.send(200, load_json("recalls.json", {}), "application/json")
            elif path == "/api/items":
                self.send(200, load_json("items.json", {"items": []}), "application/json")
            elif path == "/health":
                self.send(
                    200,
                    json.dumps({"ok": True, "app": "recall-watch", "port": PORT}),
                    "application/json",
                )
            else:
                self.send(404, "not found", "text/plain; charset=utf-8")
        except Exception as e:
            self.send(500, json.dumps({"error": str(e)}), "application/json")

    def log_message(self, fmt, *args):
        pass


def main():
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    print(f"Recall Watch http://127.0.0.1:{PORT}/", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
