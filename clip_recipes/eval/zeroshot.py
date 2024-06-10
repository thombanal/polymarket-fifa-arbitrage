"""Zero-shot eval on ImageNet-1k.

We deliberately do not ship the imagenet validation set; point ``--dataset``
at a local copy.  Class names + prompt templates are from open_clip.
"""
from __future__ import annotations
import argparse
import json

import torch
import torch.nn.functional as F
from PIL import Image


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--dataset", default="imagenet1k")
    ap.add_argument("--data-root", required=False)
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args(argv)

    ckpt = torch.load(args.checkpoint, map_location="cpu")
    from .builder import build_clip  # noqa
    model, transform, tokenize = _rebuild(ckpt)
    model = model.to(args.device).eval()

    # build text features
    classnames, templates = _load_classnames(args.dataset)
    text_feats = []
    with torch.no_grad():
        for cls in classnames:
            texts = [t.format(cls) for t in templates]
            toks = tokenize(texts).to(args.device)
            feats = model.encode_text(toks)
            feats = F.normalize(feats, dim=-1).mean(0)
            feats = F.normalize(feats, dim=-1)
            text_feats.append(feats)
    text_feats = torch.stack(text_feats)

    # iterate val set
    correct, total = 0, 0
    for img, label in _iter_val(args.dataset, args.data_root, transform):
        img = img.unsqueeze(0).to(args.device)
        with torch.no_grad():
            feat = F.normalize(model.encode_image(img), dim=-1)
            logits = feat @ text_feats.t()
        pred = logits.argmax(-1).item()
        correct += int(pred == label)
        total += 1
        if total % 1000 == 0:
            print(f"[{total}] acc={correct/total:.4f}")
    print(f"final: {correct}/{total} = {correct/max(1,total):.4f}")


def _rebuild(ckpt):
    # TODO: rebuild from ckpt['config'] properly; for now, fallback to openai b32
    from .builder import build_clip
    return build_clip()


def _load_classnames(name):
    # placeholder, point at open_clip's class lists in real use
    return ["dog", "cat"], ["a photo of a {}."]


def _iter_val(name, root, transform):
    raise NotImplementedError("plug in your own val iterator")


if __name__ == "__main__":
    main()
