#!/usr/bin/env python3
"""Refresh a curated index on GitHub Actions. No proxy, browser or third-party API.

Source pages may deny automated requests. Explicit, reviewed embed references
remain usable independently; never invent a source result or bypass a challenge.
"""
import argparse
import copy
import datetime as dt
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.1.0-beta.24.1"
SOURCE_HOSTS = {"uakino": "uakino.best", "kinoukr": "kinoukr.tv"}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def media_url(url):
    p = urlsplit(url)
    return p.scheme == "https" and not p.username and not p.password and p.port in (None, 443) and (
        p.hostname == "ashdi.vip" or (p.hostname or "").endswith(".ashdi.vip")
    ) and not re.search(r'[\s<>"\\]', url)


def fetch(url, origin=None):
    p = urlsplit(url)
    if p.scheme != "https" or p.username or p.password or p.port not in (None, 443):
        raise ValueError("Only HTTPS source and Ashdi URLs are accepted")
    if p.hostname not in SOURCE_HOSTS.values() and not media_url(url):
        raise ValueError("Host is outside the source allowlist")
    headers = {"User-Agent": "ukr-by-Faborn/" + VERSION, "Accept": "*/*"}
    if origin:
        headers["Origin"] = origin
    with urlopen(Request(url, headers=headers), timeout=20) as response:
        if urlsplit(response.url).hostname not in SOURCE_HOSTS.values() and not media_url(response.url):
            raise ValueError("Unexpected redirect destination")
        body = response.read(4 * 1024 * 1024 + 1)
        if len(body) > 4 * 1024 * 1024:
            raise ValueError("Response exceeds 4 MiB")
        charset = response.headers.get_content_charset() or "utf-8"
        return body.decode(charset, errors="replace"), dict(response.headers)


class SourcePage(HTMLParser):
    """Only extracts public iframe and episode attributes; executes no site JS."""
    def __init__(self, source_url):
        super().__init__(convert_charrefs=True)
        self.source_url = source_url
        self.embeds = []
        self.episode_refs = []
        self.current = None
        self.texts = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "iframe":
            url = urljoin(self.source_url, a.get("src") or a.get("data-src") or "")
            if re.fullmatch(r"https://ashdi\.vip/vod/\d+/?(?:\?.*)?", url):
                self.embeds.append(url.split("?")[0])
        if tag == "li" and a.get("data-file"):
            url = urljoin(self.source_url, a["data-file"])
            if re.fullmatch(r"https://ashdi\.vip/vod/\d+/?", url):
                self.current = {"embed": url, "voice": a.get("data-voice", ""), "text": ""}

    def handle_data(self, data):
        self.texts.append(data)
        if self.current is not None:
            self.current["text"] += data

    def handle_endtag(self, tag):
        if tag == "li" and self.current is not None:
            match = re.search(r"(?:Серія|серія)\s*(\d+)", self.current["text"])
            if match:
                self.current["episode"] = int(match.group(1))
                self.episode_refs.append(self.current)
            self.current = None


def quoted_property(source, key):
    # The supported Ashdi pages use quoted literal values. Never eval site code.
    match = re.search(r"\b" + re.escape(key) + r"\s*:\s*(['\"])((?:\\.|(?!\1).)*)\1", source, re.S)
    if not match:
        return ""
    value = match.group(2).replace("\\/", "/").replace("\\'", "'").replace('\\"', '"')
    value = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), value)
    return html.unescape(value)


def parse_embed(body):
    start = body.find("new Playerjs")
    if start < 0:
        raise ValueError("Ashdi: unsupported player page")
    config = body[start:]
    master = quoted_property(config, "file")
    if not media_url(master) or ".m3u8" not in urlsplit(master).path:
        raise ValueError("Ashdi: direct HLS not found; playlist/encoded config needs another adapter")
    subtitles = []
    raw_subtitles = quoted_property(config, "subtitle")
    for label, url in re.findall(r"\[([^\]]+)\](https://[^,\s]+)", raw_subtitles):
        if media_url(url):
            subtitles.append({"label": label, "url": url})
    return master, subtitles


def hls_attributes(line):
    return dict((m.group(1), m.group(2) if m.group(2) is not None else m.group(3)) for m in re.finditer(r'([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))', line))


def quality_label(url, width, height):
    match = re.search(r"/hls/(2160|1440|1080|720|480|360)/", url)
    if match:
        return match.group(1) + "p"
    # Cropped cinema masters can be 3840x1600; height alone is not a UHD test.
    for w, h, label in [(3840, 2160, "2160p"), (2560, 1440, "1440p"), (1920, 1080, "1080p"), (1280, 720, "720p"), (854, 480, "480p"), (640, 360, "360p")]:
        if width >= w or height >= h:
            return label
    return ""


def parse_master(body, url):
    if not body.lstrip().startswith("#EXTM3U"):
        raise ValueError("Invalid HLS manifest")
    variants = []
    pending = None
    for raw in body.splitlines():
        line = raw.strip()
        if line.startswith("#EXT-X-STREAM-INF:"):
            pending = hls_attributes(line.split(":", 1)[1])
        elif line and not line.startswith("#") and pending is not None:
            variant = urljoin(url, line)
            if not media_url(variant):
                raise ValueError("HLS variant is outside Ashdi")
            resolution = pending.get("RESOLUTION", "0x0").split("x")
            width, height = (int(resolution[0]), int(resolution[1]))
            label = quality_label(variant, width, height)
            if label:
                variants.append({"label": label, "url": variant, "width": width, "height": height, "bandwidth": int(pending.get("BANDWIDTH", 0))})
            pending = None
    if not variants:
        raise ValueError("No advertised quality variants; no quality will be guessed")
    variants.sort(key=lambda v: int(v["label"][:-1]), reverse=True)
    return variants


def read_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def probe_segment(variant_url):
    manifest, _ = fetch(variant_url, origin="https://example.github.io")
    if not manifest.lstrip().startswith("#EXTM3U"):
        raise ValueError("Invalid media playlist")
    lines = [line.strip() for line in manifest.splitlines() if line.strip() and not line.startswith("#")]
    if not lines:
        raise ValueError("No HLS segments")
    segment = urljoin(variant_url, lines[0])
    if not media_url(segment):
        raise ValueError("Media segment outside Ashdi")
    # Read at most 16 bytes to check transport/CORS, never mirror a film to GitHub.
    request = Request(segment, headers={"Range": "bytes=0-15", "Origin": "https://example.github.io", "Referer": "https://example.github.io/"})
    with urlopen(request, timeout=20) as response:
        response.read(16)
        cors = response.headers.get("Access-Control-Allow-Origin", "")
        return {"status": response.status, "cors": cors, "browserCompatible": cors in ("*", "https://example.github.io")}


def build(root=ROOT, check_sources=True, delay=0.15):
    config = read_json(root / "config/sources.json", {})
    previous = read_json(root / "data/catalog.json", {"titles": []})
    previous_eps = {e["id"]: e for t in previous["titles"] for r in t["releases"] for e in r["episodes"]}
    stamp = now()
    result = {"schema": 1, "version": VERSION, "coverage": "curated-beta", "generatedAt": stamp, "titles": [], "warnings": [], "sources": {}}
    page_cache = {}
    failures, refreshed = [], 0
    for title in config["titles"]:
        output = {k: copy.deepcopy(v) for k, v in title.items() if k != "releases"}
        output["releases"] = []
        for release in title["releases"]:
            if release.get("audioLanguage") != "uk" or not release.get("audioEvidence"):
                raise ValueError("A reviewed Ukrainian audio statement is required")
            source = release["source"]
            page_url = release["sourcePage"]
            if urlsplit(page_url).hostname != SOURCE_HOSTS[source]:
                raise ValueError("Source page does not belong to its provider")
            parsed = None
            if check_sources:
                if page_url not in page_cache:
                    try:
                        page, _ = fetch(page_url)
                        parsed = SourcePage(page_url)
                        parsed.feed(page)
                        page_cache[page_url] = (parsed, None)
                    except (OSError, ValueError, HTTPError) as exc:
                        page_cache[page_url] = (None, str(exc))
                parsed, page_error = page_cache[page_url]
                result["sources"].setdefault(source, {"checkedAt": stamp, "pages": []})["pages"].append({"url": page_url, "status": "ok" if parsed else "blocked", "error": page_error})
            out_release = {k: copy.deepcopy(v) for k, v in release.items() if k != "episodes"}
            out_release["episodes"] = []
            for reference in release["episodes"]:
                ref = copy.deepcopy(reference)
                # Update only a known, unambiguous film iframe or matching episode/voice.
                if parsed and title["type"] == "movie" and len(set(parsed.embeds)) == 1:
                    ref["embed"] = parsed.embeds[0]
                elif parsed and title["type"] == "tv":
                    matches = [e for e in parsed.episode_refs if e["episode"] == ref["episode"] and e["voice"] == release["voice"]]
                    if len(matches) == 1:
                        ref["embed"] = matches[0]["embed"]
                try:
                    page, _ = fetch(ref["embed"])
                    master, subtitles = parse_embed(page)
                    manifest, headers = fetch(master, origin="https://example.github.io")
                    variants = parse_master(manifest, master)
                    cors = next((v for k, v in headers.items() if k.lower() == "access-control-allow-origin"), None)
                    if cors != "*":
                        raise ValueError("HLS master has no wildcard CORS for GitHub Pages")
                    segment = probe_segment(variants[0]["url"])
                    episode = dict(ref, master=master, qualities={v["label"]: v["url"] for v in variants}, variants=variants, subtitles=subtitles, updatedAt=stamp, state="verified", cors=cors, segmentProbe=segment, playbackMode="tizen-avplay")
                    refreshed += 1
                except (OSError, ValueError, HTTPError) as exc:
                    failures.append({"id": ref["id"], "error": str(exc)})
                    if ref["id"] not in previous_eps:
                        continue
                    episode = copy.deepcopy(previous_eps[ref["id"]])
                    episode["state"] = "unavailable" if isinstance(exc, HTTPError) and exc.code == 404 else "stale"
                    episode["lastError"] = str(exc)
                    episode["lastCheckedAt"] = stamp
                out_release["episodes"].append(episode)
                time.sleep(delay)
            if out_release["episodes"]:
                output["releases"].append(out_release)
        if output["releases"]:
            result["titles"].append(output)
    result["warnings"].append("Бета-індекс містить лише назви з config/sources.json; це не повні каталоги UAKino та KinoUkr.")
    result["warnings"].append("Для відтворення потрібна перевірка штатного плеєра Tizen/AVPlay. Вебплеєр Lampa блокується CORS відеосегментів Ashdi; успішне читання маніфесту не доводить відтворення.")
    for source, details in result["sources"].items():
        # Deduplicate the same page used for several voices.
        details["pages"] = list({p["url"]: p for p in details["pages"]}.values())
        if any(p["status"] == "blocked" for p in details["pages"]):
            result["warnings"].append(source + ": частина сторінок заблокована. Використано попередньо перевірені посилання Ashdi; нові серії автоматично не виявляються.")
    if failures:
        result["warnings"].append("Не оновлено потоків: " + str(len(failures)) + ". Старі записи позначено stale; HTTP 404 — unavailable, такі серії пропускаються у плейлисті.")
    if not result["titles"]:
        raise RuntimeError("No usable streams; refusing to publish an empty index")
    (root / "data").mkdir(exist_ok=True)
    report = {"generatedAt": stamp, "refreshedStreams": refreshed, "failedStreams": failures, "sources": result["sources"]}
    for name, value in [("catalog.json", result), ("status.json", report)]:
        destination = root / "data" / name
        temp = destination.with_suffix(".tmp")
        temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(destination)
    print(json.dumps({"titles": len(result["titles"]), "refreshed": refreshed, "failed": len(failures)}, ensure_ascii=False))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--skip-source-pages", action="store_true", help="Refresh only already reviewed Ashdi references")
    args = parser.parse_args()
    build(args.root, check_sources=not args.skip_source_pages)
