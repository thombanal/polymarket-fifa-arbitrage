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



# LocalLoss to come
