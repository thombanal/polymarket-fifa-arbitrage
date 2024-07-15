"""Sanity diagnostics: embedding norm, alignment, uniformity.

Wang & Isola 2020: alignment ~ E||f(x) - f(x+)||^2, uniformity ~ log E exp(-2||f(x) - f(y)||^2).
"""
import torch
import torch.nn.functional as F


def alignment(z1, z2):
    z1 = F.normalize(z1, dim=-1)
    z2 = F.normalize(z2, dim=-1)
    return (z1 - z2).pow(2).sum(dim=-1).mean()


def uniformity(z, t: float = 2.0):
    z = F.normalize(z, dim=-1)
    sq = torch.pdist(z, p=2).pow(2)
    return sq.mul(-t).exp().mean().log()
