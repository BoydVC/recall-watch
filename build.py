#!/usr/bin/env python3
"""Fetch NHTSA/CPSC recalls for seed items; inline web/ + data into dist/recall-watch.html."""
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ET = ZoneInfo("America/New_York")
UA = {"User-Agent": "RecallWatch/1.0 (TokenMax local; household register)"}
CTX = ssl.create_default_context()


def rd(rel):
    with open(os.path.join(HERE, rel), encoding="utf-8") as f:
        return f.read()


def get_json(url, timeout=22):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return json.loads(r.read().decode())


def severity_nhtsa(rec):
    if rec.get("parkIt"):
        return "critical"
    text = " ".join(
        [
            str(rec.get("Consequence") or ""),
            str(rec.get("Summary") or ""),
            str(rec.get("Component") or ""),
        ]
    ).lower()
    if any(
        k in text
        for k in ("fire", "crash", "air bag", "airbag", "death", "fatal", "park outside")
    ):
        return "high"
    if any(
        k in text
        for k in ("injury", "fail", "loss of control", "steering", "brake")
    ):
        return "medium"
    return "low"


def severity_cpsc(rec):
    hazards = []
    for h in rec.get("Hazards") or []:
        if isinstance(h, dict):
            hazards.append(str(h.get("Name") or h.get("HazardType") or ""))
        else:
            hazards.append(str(h))
    text = (" ".join(hazards) + " " + str(rec.get("Description") or "")).lower()
    if any(
        k in text
        for k in (
            "death",
            "fatal",
            "fire",
            "electrocution",
            "strangulation",
            "suffocat",
        )
    ):
        return "high"
    if any(k in text for k in ("injury", "fall", "burn", "lacerat", "choking")):
        return "medium"
    return "low"


def norm_nhtsa(item, rec):
    camp = rec.get("NHTSACampaignNumber") or ""
    return {
        "id": f"nhtsa-{camp}-{item['id']}",
        "itemId": item["id"],
        "itemName": item["name"],
        "source": "nhtsa",
        "demo": False,
        "severity": severity_nhtsa(rec),
        "title": f"{rec.get('Make')} {rec.get('Model')} {rec.get('ModelYear')} — {rec.get('Component') or 'Recall'}",
        "campaign": camp,
        "component": rec.get("Component"),
        "summary": rec.get("Summary") or "",
        "consequence": rec.get("Consequence") or "",
        "remedy": rec.get("Remedy") or "",
        "date": rec.get("ReportReceivedDate") or "",
        "manufacturer": rec.get("Manufacturer") or "",
        "url": (
            f"https://www.nhtsa.gov/recalls?nhtsaId={camp}"
            if camp
            else "https://www.nhtsa.gov/recalls"
        ),
        "parkIt": bool(rec.get("parkIt")),
    }


def norm_cpsc(item, rec):
    rid = rec.get("RecallID") or rec.get("RecallNumber") or ""
    url = rec.get("URL") or rec.get("RecallURL") or ""
    if not url:
        url = "https://www.cpsc.gov/Recalls"
    title = rec.get("Title") or ""
    if not title:
        names = []
        for p in (rec.get("Products") or [])[:2]:
            if isinstance(p, dict):
                names.append(p.get("Name") or p.get("Description") or "")
        title = "; ".join(n for n in names if n) or f"CPSC recall {rec.get('RecallNumber')}"
    hazards = []
    for h in rec.get("Hazards") or []:
        if isinstance(h, dict):
            hazards.append(h.get("Name") or "")
        else:
            hazards.append(str(h))
    hazard_s = ", ".join(x for x in hazards if x)
    return {
        "id": f"cpsc-{rid}-{item['id']}",
        "itemId": item["id"],
        "itemName": item["name"],
        "source": "cpsc",
        "demo": False,
        "severity": severity_cpsc(rec),
        "title": title,
        "campaign": str(rec.get("RecallNumber") or rid),
        "component": hazard_s or None,
        "summary": (rec.get("Description") or "")[:1200],
        "consequence": hazard_s,
        "remedy": "",
        "date": rec.get("RecallDate") or rec.get("LastPublishDate") or "",
        "manufacturer": "",
        "url": url,
        "parkIt": False,
    }


def fetch_live(items):
    matches = []
    errors = []
    live_ok = {"nhtsa": False, "cpsc": False}
    for item in items:
        try:
            if item.get("source") == "nhtsa":
                q = urllib.parse.urlencode(
                    {
                        "make": item["make"],
                        "model": item["model"],
                        "modelYear": int(item["year"]),
                    }
                )
                data = get_json(
                    f"https://api.nhtsa.gov/recalls/recallsByVehicle?{q}"
                )
                live_ok["nhtsa"] = True
                for rec in (data.get("results") or [])[:5]:
                    matches.append(norm_nhtsa(item, rec))
            elif item.get("source") == "cpsc":
                q = item.get("productQuery") or item.get("model") or item.get("brand")

                def cpsc_ok(rec):
                    if not isinstance(rec, dict):
                        return False
                    title = str(rec.get("Title") or "")
                    low = title.lower()
                    if low.startswith("error") or "failed on open" in low:
                        return False
                    if not (rec.get("RecallID") or rec.get("RecallNumber")):
                        return False
                    return True

                def cpsc_search(param, value):
                    raw = get_json(
                        "https://www.saferproducts.gov/RestWebServices/Recall?"
                        + urllib.parse.urlencode({"format": "json", param: value})
                    )
                    if not isinstance(raw, list):
                        raise RuntimeError("CPSC returned non-list")
                    return [rec for rec in raw if cpsc_ok(rec)]

                data = cpsc_search("ProductName", q)
                if not data and item.get("brand"):
                    data = cpsc_search("RecallTitle", item["brand"])
                if not data:
                    data = cpsc_search("RecallTitle", q)
                live_ok["cpsc"] = True
                brand = (item.get("brand") or "").lower()
                if brand:
                    filtered = [
                        rec
                        for rec in data
                        if brand in str(rec.get("Title") or "").lower()
                    ]
                    use = filtered[:4] if filtered else data[:2]
                else:
                    use = data[:3]
                for rec in use:
                    matches.append(norm_cpsc(item, rec))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError, KeyError, ValueError) as e:
            errors.append({"itemId": item.get("id"), "error": str(e)})
    return matches, errors, live_ok


def load_demo_matches():
    path = os.path.join(HERE, "data", "demo-recalls.json")
    with open(path, encoding="utf-8") as f:
        demo = json.load(f)
    matches = demo.get("matches") or []
    for m in matches:
        m["demo"] = True
        if not str(m.get("title", "")).startswith("[DEMO]"):
            m["title"] = "[DEMO] " + str(m.get("title") or "Illustrative match")
    return matches


def build_snapshot(items_doc):
    matches, errors, live_ok = fetch_live(items_doc.get("items") or [])
    if matches:
        mode = "live"
    else:
        mode = "demo"
        matches = load_demo_matches()
    snap = {
        "version": 1,
        "fetchedAt": datetime.now(ET).isoformat(timespec="seconds"),
        "mode": mode,
        "liveOk": live_ok,
        "errors": errors,
        "matchCount": len(matches),
        "matches": matches,
    }
    out = os.path.join(HERE, "data", "recalls.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=2, ensure_ascii=False)
    return snap


def main():
    items_path = os.path.join(HERE, "data", "items.json")
    with open(items_path, encoding="utf-8") as f:
        items_doc = json.load(f)

    cached = os.path.join(HERE, "data", "recalls.json")
    use_cache = os.environ.get("RECALL_WATCH_CACHE", "").strip() in ("1", "true", "yes")
    if use_cache and os.path.isfile(cached):
        with open(cached, encoding="utf-8") as f:
            snap = json.load(f)
        print(f"using cached recalls.json (mode={snap.get('mode')} matches={snap.get('matchCount')})")
    else:
        # Prefer refreshing live; if network fails keep prior recalls.json if present
        try:
            snap = build_snapshot(items_doc)
        except Exception as e:
            print(f"fetch failed ({e}); using cached or demo")
            if os.path.isfile(cached):
                with open(cached, encoding="utf-8") as f:
                    snap = json.load(f)
            else:
                matches = load_demo_matches()
                snap = {
                    "version": 1,
                    "fetchedAt": datetime.now(ET).isoformat(timespec="seconds"),
                    "mode": "demo",
                    "liveOk": {"nhtsa": False, "cpsc": False},
                    "errors": [{"itemId": None, "error": str(e)}],
                    "matchCount": len(matches),
                    "matches": matches,
                }
                with open(cached, "w", encoding="utf-8") as f:
                    json.dump(snap, f, indent=2, ensure_ascii=False)

    payload = {
        "items": items_doc,
        "recalls": snap,
        "demo": json.loads(rd("data/demo-recalls.json")),
    }
    data_js = json.dumps(payload, ensure_ascii=False)
    html = rd("web/index.html")
    html = html.replace("/*__CSS__*/", rd("web/app.css"))
    html = html.replace("/*__DATA__*/ null /*__/DATA__*/", data_js)
    app = rd("web/app.js").replace("</script", "<\\/script")
    html = html.replace("/*__APP__*/", app)
    os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
    out = os.path.join(HERE, "dist", "recall-watch.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    demo_n = sum(1 for m in snap.get("matches") or [] if m.get("demo"))
    print(
        f"built {out} ({os.path.getsize(out):,} bytes) · "
        f"items={len(items_doc.get('items') or [])} "
        f"matches={snap.get('matchCount')} mode={snap.get('mode')} "
        f"demoFlags={demo_n}"
    )


if __name__ == "__main__":
    main()
