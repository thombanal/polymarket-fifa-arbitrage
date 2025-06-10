"""LR schedules. Cosine with warmup is the default."""
from __future__ import annotations
import math

import torch


def cosine_with_warmup(opt, warmup: int, total: int, min_lr_ratio: float = 0.05):
    def lr_lambda(step):
        if step < warmup:
            return step / max(1, warmup)
        prog = (step - warmup) / max(1, total - warmup)
        return min_lr_ratio + (1 - min_lr_ratio) * 0.5 * (1 + math.cos(math.pi * prog))

    return torch.optim.lr_scheduler.LambdaLR(opt, lr_lambda)

# warmup is absolute step count, not a fraction

# constant_with_warmup added for ablations
