"""LoRA attachment for open_clip ViT + text transformer."""
from __future__ import annotations
import math

import torch
import torch.nn as nn


class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, r: int, alpha: int):
        super().__init__()
        self.base = base
        for p in self.base.parameters():
            p.requires_grad = False
        in_f, out_f = base.in_features, base.out_features
        self.lora_a = nn.Parameter(torch.empty(r, in_f))
        self.lora_b = nn.Parameter(torch.zeros(out_f, r))
        nn.init.kaiming_uniform_(self.lora_a, a=math.sqrt(5))
        self.scaling = alpha / r

    def forward(self, x):
        return self.base(x) + (x @ self.lora_a.t() @ self.lora_b.t()) * self.scaling


def attach_lora(model: nn.Module, r: int, alpha: int, targets=("c_attn", "in_proj_weight", "qkv")):
    """Replace nn.Linear modules whose name matches one of ``targets`` with LoRALinear."""
    for name, mod in list(model.named_modules()):
        for child_name, child in list(mod.named_children()):
            if isinstance(child, nn.Linear) and child_name in targets:
                setattr(mod, child_name, LoRALinear(child, r=r, alpha=alpha))
