"""SigLIP-style binary cross-entropy loss.

Less battle-tested than InfoNCE in this codebase; numbers here are preliminary.
"""
from __future__ import annotations
import torch
import torch.nn as nn
import torch.nn.functional as F


class SigLipLoss(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, image_feats, text_feats, logit_scale, logit_bias=None):
        image_feats = F.normalize(image_feats, dim=-1)
        text_feats = F.normalize(text_feats, dim=-1)
        logits = logit_scale * image_feats @ text_feats.t()
        if logit_bias is not None:
            logits = logits + logit_bias
        n = logits.shape[0]
        # +1 on diagonal, -1 off-diagonal
        labels = 2 * torch.eye(n, device=logits.device) - 1
        return -F.logsigmoid(labels * logits).sum() / n
