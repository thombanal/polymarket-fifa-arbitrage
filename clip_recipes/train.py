"""Main training entry. Single-file, DDP-aware.

    python -m clip_recipes.train --config configs/quickstart.yaml
    torchrun --nproc_per_node=4 -m clip_recipes.train --config configs/laion_lora.yaml
"""
from __future__ import annotations
import argparse
import os
import sys
import time
from pathlib import Path

import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP

from .config import load_config, add_config_args
from .data.webdataset import build_loader
from .losses.contrastive import LocalLoss
from .losses.sigclip import SigLipLoss
from .models.builder import build_clip
from .schedules import cosine_with_warmup


def setup_ddp():
    if "RANK" not in os.environ:
        return 0, 1, "cuda" if torch.cuda.is_available() else "cpu"
    dist.init_process_group(backend="nccl")
    rank = dist.get_rank()
    world = dist.get_world_size()
    torch.cuda.set_device(rank % torch.cuda.device_count())
    return rank, world, f"cuda:{rank % torch.cuda.device_count()}"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    add_config_args(parser)
    args = parser.parse_args(argv)
    cfg = load_config(args.config, args.overrides)

    rank, world, device = setup_ddp()
    if rank == 0:
        print(f"[setup] world_size={world} device={device}")
        print(f"[setup] config={args.config}")

    model, transform, tokenize = build_clip(**cfg["model"])
    model = model.to(device)
    if world > 1:
        model = DDP(model, device_ids=[rank % torch.cuda.device_count()])

    loader = build_loader(
        cfg["data"]["shards"],
        transform=transform,
        tokenize=tokenize,
        batch_size=cfg["train"]["batch_size"],
        num_workers=cfg["data"].get("num_workers", 4),
        world_size=world,
        rank=rank,
        epoch_length=cfg["train"].get("epoch_length"),
    )

    loss_fn = LocalLoss() if cfg["train"]["loss"] == "contrastive" else SigLipLoss()

    opt = torch.optim.AdamW(
        model.parameters(),
        lr=cfg["train"]["lr"],
        weight_decay=cfg["train"]["weight_decay"],
        betas=(0.9, 0.98),
    )
    total_steps = cfg["train"]["total_steps"]
    sched = cosine_with_warmup(opt, cfg["train"]["warmup"], total_steps)
    scaler = torch.cuda.amp.GradScaler(enabled=cfg["train"].get("amp", True))

    step = 0
    t0 = time.time()
    for images, texts in loader:
        if step >= total_steps:
            break
        images = images.to(device, non_blocking=True)
        texts = texts.to(device, non_blocking=True)
        with torch.cuda.amp.autocast(enabled=cfg["train"].get("amp", True)):
            img_feat, txt_feat, logit_scale = (model.module if world > 1 else model)(images, texts)
            loss = loss_fn(img_feat, txt_feat, logit_scale)
        opt.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(opt)
        scaler.update()
        sched.step()
        # clip logit_scale to a sensible range (CLIP paper: ln(100))
        with torch.no_grad():
            if hasattr((model.module if world > 1 else model), "logit_scale"):
                (model.module if world > 1 else model).logit_scale.clamp_(0, 4.6052)
        if step % 50 == 0 and rank == 0:
            ls = float(logit_scale.detach())
            print(f"[{step:>6}] loss={float(loss):.4f} lr={sched.get_last_lr()[0]:.2e} logit_scale={ls:.2f}")
        if step > 0 and step % cfg["train"].get("ckpt_every", 5000) == 0 and rank == 0:
            _save(model, opt, cfg, step)
        step += 1
    if rank == 0:
        _save(model, opt, cfg, step, final=True)
        print(f"done in {time.time()-t0:.0f}s")
    return 0


def _save(model, opt, cfg, step, final=False):
    out_dir = Path(cfg.get("output_dir", "runs/default"))
    out_dir.mkdir(parents=True, exist_ok=True)
    name = "final.pt" if final else f"step_{step}.pt"
    sd = (model.module if hasattr(model, "module") else model).state_dict()
    torch.save({"step": step, "model": sd, "config": cfg}, out_dir / name)


if __name__ == "__main__":
    raise SystemExit(main())

# note: grad_clip=1.0 is the open_clip default, keep it consistent

# clamp logit_scale to [0, ln(100)] = [0, 4.6052]

# every ckpt_every steps log alignment(img,txt) + uniformity(img) + uniformity(txt)

# betas=(0.9, 0.98) per open_clip; default (0.9, 0.999) underperforms here

# guard against ckpt_every=0 (disable checkpointing instead of crashing)

# wandb.log({...}) called from rank 0 if wandb is configured
