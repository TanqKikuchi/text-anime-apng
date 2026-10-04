"""Independent APNG verifier (Pillow-based).

Usage: python tools/verify_apng.py <file.apng> [--expect-json '{"width":..,"height":..,"frames":..,"loop":..,"total_ms":..}'] [--dump-dir DIR]

Decodes the file with Pillow (dispose/blend compositing included), prints a JSON
summary, optionally checks expectations and dumps composited RGBA frames as PNG.
Exit code 0 = all expectations met, 1 = mismatch, 2 = decode error.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

from PIL import Image


def read_chunks(data: bytes) -> list[tuple[str, bytes]]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("bad PNG signature")
    pos, chunks = 8, []
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        (crc,) = struct.unpack(">I", data[pos + 8 + length : pos + 12 + length])
        if zlib.crc32(ctype + body) & 0xFFFFFFFF != crc:
            raise ValueError(f"CRC mismatch in {ctype!r}")
        chunks.append((ctype.decode("ascii"), body))
        pos += 12 + length
    return chunks


def structural_summary(data: bytes) -> dict:
    chunks = read_chunks(data)
    names = [c for c, _ in chunks]
    if names[0] != "IHDR" or names[-1] != "IEND":
        raise ValueError("IHDR must be first and IEND last")
    seq_expected = 0
    fctl_count = 0
    idat_in_anim = False
    seen_fctl_before_idat = False
    num_plays = None
    num_frames_declared = None
    for i, (name, body) in enumerate(chunks):
        if name == "acTL":
            num_frames_declared, num_plays = struct.unpack(">II", body)
        elif name in ("fcTL", "fdAT"):
            (seq,) = struct.unpack(">I", body[:4])
            if seq != seq_expected:
                raise ValueError(f"sequence number {seq} != expected {seq_expected}")
            seq_expected += 1
            if name == "fcTL":
                fctl_count += 1
                if "IDAT" not in names[:i]:
                    seen_fctl_before_idat = True
        elif name == "IDAT" and seen_fctl_before_idat:
            idat_in_anim = True
    if num_frames_declared is not None and num_frames_declared != fctl_count:
        raise ValueError(f"acTL num_frames {num_frames_declared} != fcTL count {fctl_count}")
    return {
        "chunks": names,
        "num_plays": num_plays,
        "anim_frames": fctl_count,
        "default_image_in_animation": idat_in_anim,
    }


def decode(path: Path, dump_dir: Path | None) -> dict:
    data = path.read_bytes()
    summary = structural_summary(data)
    im = Image.open(path)
    summary["width"], summary["height"] = im.size
    frames = []
    durations = []
    n = getattr(im, "n_frames", 1)
    for idx in range(n):
        im.seek(idx)
        rgba = im.convert("RGBA")
        frames.append(rgba)
        durations.append(int(round(im.info.get("duration", 0))))
        if dump_dir is not None:
            dump_dir.mkdir(parents=True, exist_ok=True)
            rgba.save(dump_dir / f"frame_{idx:04d}.png")
    summary["pillow_frames"] = n
    summary["durations_ms"] = durations
    summary["total_ms"] = sum(durations)
    summary["loop"] = im.info.get("loop")
    summary["byte_size"] = len(data)
    return summary


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--expect-json", default=None)
    ap.add_argument("--dump-dir", default=None)
    ap.add_argument("--total-ms-tolerance", type=int, default=20)
    args = ap.parse_args()
    try:
        s = decode(Path(args.file), Path(args.dump_dir) if args.dump_dir else None)
    except Exception as e:  # noqa: BLE001 - report any decode failure
        print(json.dumps({"ok": False, "error": str(e)}))
        return 2
    problems = []
    if args.expect_json:
        exp = json.loads(args.expect_json)
        for key in ("width", "height", "anim_frames", "num_plays", "default_image_in_animation"):
            if key in exp and exp[key] != s.get(key):
                problems.append(f"{key}: expected {exp[key]}, got {s.get(key)}")
        if "total_ms" in exp and abs(exp["total_ms"] - s["total_ms"]) > args.total_ms_tolerance:
            problems.append(f"total_ms: expected {exp['total_ms']}, got {s['total_ms']}")
        if "max_bytes" in exp and s["byte_size"] > exp["max_bytes"]:
            problems.append(f"byte_size {s['byte_size']} > {exp['max_bytes']}")
    s["ok"] = not problems
    s["problems"] = problems
    print(json.dumps(s, ensure_ascii=False))
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main())
