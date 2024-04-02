"""Build webdataset shards from a folder of (image, caption) pairs."""
import argparse
import tarfile
import hashlib
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--shard-size", type=int, default=10000)
    ap.add_argument("--exclude-hashes", default=None, help="newline sha256 list to skip")
    args = ap.parse_args()
    excl = set()
    if args.exclude_hashes:
        with open(args.exclude_hashes) as f:
            excl = {l.strip().split()[0] for l in f if l.strip()}
    src = Path(args.src)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    pairs = list(zip(sorted(src.glob("*.jpg")), sorted(src.glob("*.txt"))))
    shard_idx = 0
    written = 0
    tf = None
    for img, txt in pairs:
        b = img.read_bytes()
        if hashlib.sha256(b).hexdigest() in excl:
            continue
        if written % args.shard_size == 0:
            if tf:
                tf.close()
            tf = tarfile.open(out / f"{shard_idx:05d}.tar", "w")
            shard_idx += 1
        base = img.stem
        for ext, data in [("jpg", b), ("txt", txt.read_bytes())]:
            info = tarfile.TarInfo(name=f"{base}.{ext}")
            info.size = len(data)
            tf.addfile(info, fileobj=__import__("io").BytesIO(data))
        written += 1
    if tf:
        tf.close()
    print(f"wrote {written} samples in {shard_idx} shards")


if __name__ == "__main__":
    main()
