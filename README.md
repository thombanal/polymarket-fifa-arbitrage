# CLIP Tuning Cookbook

[![PyPI](https://img.shields.io/pypi/v/clip-recipes?color=blue)](https://pypi.org/project/clip-recipes/)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)](LICENSE)
[![PyTorch](https://img.shields.io/badge/pytorch-2.1%2B-orange.svg)](https://pytorch.org)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](#)
[![Discord](https://img.shields.io/badge/chat-discord-7289da.svg)](#)

End-to-end recipes for fine-tuning CLIP-style dual encoders on **custom**
image-text data, with an emphasis on practical hygiene: leakage checks,
contrastive batch construction that actually works at 4-GPU scale, and the
LR/warmup schedules that don't blow up the temperature parameter.

> If you're new to CLIP fine-tuning, start with `recipes/quickstart.md`.
> If you've burned a checkpoint to bad contrastive batches before, the
> "Batch hygiene" section is what you want.

## Features

- **Streaming data pipeline** — webdataset shards + on-the-fly de-dup against eval sets
- **Hard-negative mining** — text/image side, optional FAISS index
- **DDP training loop** — proper local-loss aggregation, no all-gather memory spikes
- **LoRA / full FT / linear-probe** — three recipes, one config schema
- **Eval hooks** — zero-shot ImageNet, retrieval (Flickr30k-CN / COCO-CN)
- **Sanity scripts** — temperature drift, gradient norms, embedding collapse

## Install

```bash
pip install clip-recipes
# or, from source:
pip install -e .[train]
```

For Chinese / multilingual experiments:

```bash
pip install clip-recipes[zh]
```

## Quick start

Single-node, single-GPU sanity run on the bundled tiny dataset:

```bash
python -m clip_recipes.train --config configs/quickstart.yaml
```

Real run, 4xA100:

```bash
torchrun --nproc_per_node=4 -m clip_recipes.train \
    --config configs/laion_400m_lora.yaml \
    --output_dir runs/laion_lora_v3
```

## What's in here

```
clip_recipes/
  train.py            # main entry, DDP-aware
  data/
    webdataset.py     # tar-shard loader
    dedup.py          # SHA-256 leakage filter
    augment.py
  losses/
    contrastive.py    # InfoNCE w/ logit_scale
    sigclip.py        # SigLIP-style binary CE
  models/
    builder.py        # build_clip(...) factory
    lora.py
  eval/
    zeroshot.py
    retrieval.py
  schedules.py
configs/
  quickstart.yaml
  laion_400m_lora.yaml
  laion_full_ft.yaml
  zh_clip_continue.yaml
```

## Configs

Configs are plain YAML. The schema is in `clip_recipes/config.py`; everything
overridable from CLI via `key=value`. Example:

```bash
python -m clip_recipes.train --config configs/quickstart.yaml \
    train.lr=3e-5 train.batch_size=512 model.lora_r=8
```

## Batch hygiene

The single biggest win we've seen for small-team CLIP fine-tuning is **not**
a better loss or a fancier optimizer; it's making sure the contrastive batch
contains genuinely diverse negatives. The pipeline does three things:

1. **De-dup against eval sets at shard build time** (`tools/build_shards.py`)
2. **Shuffle at the shard level *and* within shards** (`webdataset.py`)
3. **Cross-GPU negatives via local-loss aggregation** (`losses/contrastive.py`)

Don't skip step 3 if you train on >1 GPU. Without it you're effectively doing
4 independent 256-batch InfoNCE runs and calling it 1024.

## Evaluation

```bash
python -m clip_recipes.eval.zeroshot \
    --checkpoint runs/laion_lora_v3/final.pt \
    --dataset imagenet1k --device cuda
```

For Chinese retrieval:

```bash
python -m clip_recipes.eval.retrieval \
    --checkpoint runs/zh_continue/final.pt \
    --dataset flickr30k-cn
```

## Caveats / known issues

- The `sigclip` loss path is less battle-tested than `contrastive`; treat numbers as preliminary.
- TODO: gradient checkpointing for ViT-L+ — currently OOMs on 40GB cards above batch 512.
- The webdataset loader has a sharp edge around shard counts not divisible by world size; we drop the trailing shards. See `data/webdataset.py:42`.

## Citing

If this codebase helped your paper, a footnote pointing here is appreciated.

## License

Apache-2.0. See `LICENSE`.

<!-- end -->
