"""WebDataset shard loader.

We use webdataset because:
1. tar shards are fast to read sequentially (one syscall per shard, not per file)
2. it composes cleanly with torch DataLoader workers
3. shard-level shuffle + intra-shard shuffle gives diverse contrastive batches

Sharp edge (line 42): shard count must be >= world_size, and ideally divisible.
We drop trailing shards if not divisible — see comment below.
"""
from __future__ import annotations
import glob
import io
import os
from typing import Callable, Optional

import torch
import webdataset as wds
from PIL import Image


def build_loader(
    shard_pattern: str,
    transform: Callable,
    tokenize: Callable,
    batch_size: int,
    num_workers: int = 4,
    world_size: int = 1,
    rank: int = 0,
    shuffle_buffer: int = 1024,
    epoch_length: Optional[int] = None,
) -> torch.utils.data.DataLoader:
    shards = sorted(glob.glob(shard_pattern))
    if not shards:
        raise FileNotFoundError(f"no shards matched {shard_pattern}")
    # sharp edge: drop trailing shards if not divisible by world_size.
    # the alternative (round-robin assign) caused subtle imbalance in our setup.
    drop = len(shards) % world_size
    if drop:
        shards = shards[:-drop]
    per_rank = shards[rank::world_size]

    def _decode(sample):
        img = Image.open(io.BytesIO(sample["jpg"])).convert("RGB")
        txt = sample["txt"].decode() if isinstance(sample["txt"], bytes) else sample["txt"]
        return transform(img), tokenize(txt)

    ds = (
        wds.WebDataset(per_rank, shardshuffle=True, nodesplitter=wds.shardlists.single_node_only)
        .shuffle(shuffle_buffer)
        .map(_decode)
        .batched(batch_size, partial=False)
    )
    if epoch_length:
        ds = ds.with_epoch(epoch_length)
    return torch.utils.data.DataLoader(ds, batch_size=None, num_workers=num_workers, pin_memory=True)

# default shuffle_buffer=1024 caused obvious caption-block correlation at B=256, raise upstream
