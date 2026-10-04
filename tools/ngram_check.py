"""Copy-detection helper: token 8-gram overlap between our code and a reference tree.

Rule (fixed before running, see docs/decisions.md D-03):
  - Tokenize JS/TS/CSS: comments and string/template literals are removed.
  - Tokens are lowercased identifiers, numbers and single punctuation characters.
  - An 8-gram counts as "meaningful" only if it contains >= 2 distinct identifiers
    of length >= 4 that are not language keywords / common built-ins.
  - Excluded (spec-derived) identifiers are treated as non-meaningful: PNG/APNG/zlib/
    CRC/ZIP field vocabulary and standard easing names (EXCLUDED below).
Usage:
  python tools/ngram_check.py build-index <reference_dir> <index.json>   (stores SHA-1 hashes only)
  python tools/ngram_check.py check <ours_dir> <index.json>
Exit 0 when no meaningful shared 8-gram exists, 1 otherwise (matches printed).
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

N = 8
KEYWORDS = set(
    """
break case catch class const continue debugger default delete do else export extends
false finally for function if import in instanceof new null return super switch this
throw true try typeof var void while with yield let static enum await async of as
interface type implements private public protected readonly undefined number string
boolean
math floor ceil round max min abs sqrt length push array uint8array uint32array
uint8clampedarray float32array dataview math.pi object keys values entries json
parse stringify promise resolve reject document window console error number set map
width height data slice subarray fill from
""".split()
)
EXCLUDED = set(
    """
crc crc32 adler adler32 ihdr idat iend actl fctl fdat plte trns signature chunk chunks
sequence dispose blend delay num_frames num_plays deflate compressionstream zlib
x_offset y_offset delay_num delay_den zip local central header crc_table
linear inquad outquad inoutquad incubic outcubic inoutcubic inquart outquart inexpo
outexpo inback outback outbounce outelastic ease easing
""".split()
)

TOKEN_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[^\s\w]")
COMMENT_RE = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)
STRING_RE = re.compile(r"`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"", re.S)


def tokens(text: str) -> list[str]:
    text = COMMENT_RE.sub(" ", text)
    text = STRING_RE.sub(" S ", text)
    return [t.lower() for t in TOKEN_RE.findall(text)]


def meaningful(gram: tuple[str, ...]) -> bool:
    ids = {
        t
        for t in gram
        if re.match(r"[a-z_$]", t) and len(t) >= 4 and t not in KEYWORDS and t not in EXCLUDED
    }
    return len(ids) >= 2


def grams(path: Path) -> dict[tuple[str, ...], int]:
    toks = tokens(path.read_text(encoding="utf-8", errors="ignore"))
    out: dict[tuple[str, ...], int] = {}
    for i in range(len(toks) - N + 1):
        g = tuple(toks[i : i + N])
        if meaningful(g):
            out.setdefault(g, i)
    return out


def files(root: Path, exts: tuple[str, ...]) -> list[Path]:
    skip = {"node_modules", "dist", "test-results", "playwright-report"}
    return [p for p in root.rglob("*") if p.suffix in exts and not (skip & set(p.parts))]


def h(g: tuple[str, ...]) -> str:
    return hashlib.sha1(" ".join(g).encode()).hexdigest()


def main() -> int:
    cmd = sys.argv[1]
    if cmd == "build-index":
        ref, out = Path(sys.argv[2]), Path(sys.argv[3])
        hashes: set[str] = set()
        for p in files(ref, (".js", ".css", ".html")):
            hashes.update(h(g) for g in grams(p))
        out.write_text(json.dumps({"n": N, "hashes": sorted(hashes)}), encoding="utf-8")
        print(f"indexed {len(hashes)} meaningful {N}-grams")
        return 0
    ours, index = Path(sys.argv[2]), Path(sys.argv[3])
    ref_hashes = set(json.loads(index.read_text(encoding="utf-8"))["hashes"])
    hits = 0
    for p in files(ours, (".ts", ".js", ".css", ".html")):
        for g in grams(p):
            if h(g) in ref_hashes:
                hits += 1
                print(f"{p}: {' '.join(g)}")
    print(f"meaningful shared {N}-grams: {hits}")
    return 0 if hits == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
