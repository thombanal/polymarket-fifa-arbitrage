"""Tiny YAML config loader with CLI overrides.

Not OmegaConf; we just want dotted-key overrides without dragging in another
heavy dep.  ``train.lr=3e-5`` from the CLI patches the nested dict at load
time.
"""
from __future__ import annotations
import argparse
import yaml
from pathlib import Path


def _set_deep(d: dict, dotted: str, value):
    keys = dotted.split(".")
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    # type-coerce by peeking at existing value
    if keys[-1] in d:
        cur = d[keys[-1]]
        if isinstance(cur, bool):
            value = value.lower() in ("1", "true", "yes")
        elif isinstance(cur, int):
            value = int(value)
        elif isinstance(cur, float):
            value = float(value)
    d[keys[-1]] = value


def load_config(path: str, overrides: list[str] | None = None) -> dict:
    with open(path) as f:
        cfg = yaml.safe_load(f)
    for ov in overrides or []:
        if "=" not in ov:
            raise ValueError(f"override must be key=value, got {ov!r}")
        k, v = ov.split("=", 1)
        _set_deep(cfg, k, v)
    return cfg


def add_config_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--config", required=True)
    p.add_argument("overrides", nargs="*")
