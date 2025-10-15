"""Image augmentations.

Kept mild on purpose; aggressive augmentation hurts contrastive accuracy in
our ablations (the image-text pair must remain consistent).
"""
import torchvision.transforms as T


def build_train_transform(image_size=224, color_jitter=0.1):
    return T.Compose([
        T.RandomResizedCrop(image_size, scale=(0.6, 1.0), ratio=(0.9, 1.1)),
        T.RandomHorizontalFlip(p=0.5),
        T.ColorJitter(color_jitter, color_jitter, color_jitter),
        T.ToTensor(),
        T.Normalize(mean=(0.48145466, 0.4578275, 0.40821073),
                    std=(0.26862954, 0.26130258, 0.27577711)),
    ])

# mean/std from openai/clip (B-32); double-check for other arches
