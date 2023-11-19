"""Model builders. Thin wrapper over open_clip / transformers.

We keep the build step in one place so configs are interchangeable; switching
from ViT-B/32 to ViT-L/14 should be a one-line config change.
"""
from __future__ import annotations
from typing import Callable, Tuple

import torch
import torch.nn as nn


def build_clip(arch: str = "ViT-B-32", pretrained: str = "openai",
               lora_r: int = 0, lora_alpha: int = 16,
               freeze_text: bool = False, freeze_vision: bool = False
               ) -> Tuple[nn.Module, Callable, Callable]:
    import open_clip

    model, _, transform = open_clip.create_model_and_transforms(arch, pretrained=pretrained)
    tokenize = open_clip.get_tokenizer(arch)

    if freeze_text:
        for p in model.transformer.parameters():
            p.requires_grad = False
    if freeze_vision:
        for p in model.visual.parameters():
            p.requires_grad = False
    if lora_r > 0:
        from .lora import attach_lora
        attach_lora(model, r=lora_r, alpha=lora_alpha)

    return _Wrapper(model), transform, tokenize


class _Wrapper(nn.Module):
    """Wrap the open_clip model so forward returns (img_feat, txt_feat, logit_scale)."""

    def __init__(self, inner):
        super().__init__()
        self.inner = inner

    @property
    def logit_scale(self):
        return self.inner.logit_scale

    def forward(self, images, texts):
        img = self.inner.encode_image(images)
        txt = self.inner.encode_text(texts)
        return img, txt, self.inner.logit_scale.exp()
