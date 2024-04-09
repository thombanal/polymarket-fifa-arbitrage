"""De-dup training shards against an eval set by SHA-256."""
from __future__ import annotations
import argparse
import hashlib
import tarfile
from pathlib import Path


def hash_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shards", required=True)
    ap.add_argument("--eval-hashes", required=True, help="newline-separated sha256 file")
    ap.add_argument("--report", default="dedup_report.txt")
    args = ap.parse_args()

    eval_set = set()
    with open(args.eval_hashes) as f:
        for line in f:
            line = line.strip()
            if line:
                eval_set.add(line.split()[0])

    hits = 0
    with open(args.report, "w") as report:
        for shard in Path().glob(args.shards):
            with tarfile.open(shard) as tf:
                for m in tf:
                    if not m.name.endswith(".jpg"):
                        continue
                    fp = tf.extractfile(m)
                    if not fp:
                        continue
                    h = hash_bytes(fp.read())
                    if h in eval_set:
                        hits += 1
                        report.write(f"{shard}::{m.name}\t{h}\n")
    print(f"done. {hits} leaks. See {args.report}")


if __name__ == "__main__":
    main()
