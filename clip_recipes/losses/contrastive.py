"""InfoNCE contrastive loss with cross-device negative aggregation.

The naive impl computes logits over the per-rank batch only.  At 4-GPU scale
with B=256 per rank, that's effectively 4 independent B=256 runs — much
weaker than one B=1024 run.  ``LocalLoss`` does the all-gather and computes
logits against the full B*world_size batch.
"""
from __future__ import annotations
import torch
import torch.distributed as dist
import torch.nn as nn
import torch.nn.functional as F


class LocalLoss(nn.Module):
    """Local-loss aggregation: each rank computes loss using all ranks' features.

    Memory: O(B*world_size) embeddings on each rank.  At B=512, world=8 and
    dim=768 this is 12MB — totally fine.
    """

    def __init__(self):
        super().__init__()

    def _gather(self, t: torch.Tensor) -> torch.Tensor:
        if not (dist.is_available() and dist.is_initialized()):
            return t
        world = dist.get_world_size()
        if world == 1:
            return t
        gathered = [torch.zeros_like(t) for _ in range(world)]
        dist.all_gather(gathered, t)
        # Replace the local entry with the differentiable t so grads flow.
        rank = dist.get_rank()
        gathered[rank] = t
        return torch.cat(gathered, dim=0)

    def forward(self, image_feats: torch.Tensor, text_feats: torch.Tensor,
                logit_scale: torch.Tensor) -> torch.Tensor:
        image_feats = F.normalize(image_feats, dim=-1)
        text_feats = F.normalize(text_feats, dim=-1)
        img_all = self._gather(image_feats)
        txt_all = self._gather(text_feats)

        rank = dist.get_rank() if dist.is_initialized() else 0
        bsz = image_feats.shape[0]
        offset = rank * bsz

        logits_i2t = logit_scale * image_feats @ txt_all.t()
        logits_t2i = logit_scale * text_feats @ img_all.t()
        labels = torch.arange(bsz, device=image_feats.device) + offset
        loss = 0.5 * (F.cross_entropy(logits_i2t, labels) + F.cross_entropy(logits_t2i, labels))
        return loss

# bug: labels were `arange(B)` regardless of rank, fixed to add rank*B offset
