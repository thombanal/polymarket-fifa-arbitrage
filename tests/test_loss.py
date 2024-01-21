import torch

from clip_recipes.losses.contrastive import LocalLoss
from clip_recipes.losses.sigclip import SigLipLoss
from clip_recipes.schedules import cosine_with_warmup


def test_local_loss_single_process():
    loss_fn = LocalLoss()
    img = torch.randn(8, 64)
    txt = torch.randn(8, 64)
    scale = torch.tensor(20.0)
    loss = loss_fn(img, txt, scale)
    assert torch.isfinite(loss)
    assert loss > 0


def test_sigclip_finite():
    loss_fn = SigLipLoss()
    img = torch.randn(4, 32)
    txt = torch.randn(4, 32)
    scale = torch.tensor(10.0)
    loss = loss_fn(img, txt, scale)
    assert torch.isfinite(loss)


def test_cosine_warmup():
    opt = torch.optim.SGD([torch.nn.Parameter(torch.zeros(1))], lr=1e-3)
    sched = cosine_with_warmup(opt, warmup=10, total=100)
    lrs = []
    for _ in range(100):
        opt.step()
        sched.step()
        lrs.append(sched.get_last_lr()[0])
    # warmup ramps up, cosine ramps down
    assert lrs[5] < lrs[15]
    assert lrs[99] < lrs[15]
