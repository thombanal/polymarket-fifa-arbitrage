"""Naive training loop. WIP."""
import torch
import open_clip

def main():
    model, _, transform = open_clip.create_model_and_transforms("ViT-B-32", pretrained="openai")
    print("loaded", sum(p.numel() for p in model.parameters()), "params")

if __name__ == "__main__":
    main()
