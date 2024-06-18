"""Image<->text retrieval eval."""
import argparse
import json
import torch
import torch.nn.functional as F


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--dataset", required=True, choices=["flickr30k-cn", "coco-cn", "flickr30k"])
    ap.add_argument("--data-root", required=False)
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()
    # TODO: load val pairs, compute R@1/5/10
    print(f"would eval {args.checkpoint} on {args.dataset}")


if __name__ == "__main__":
    main()
