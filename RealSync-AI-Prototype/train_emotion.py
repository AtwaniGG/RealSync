#!/usr/bin/env python
"""
Train emotion recognition model using FER2013 + AffectNet datasets.

Usage:
    python train_emotion.py                     # train on FER2013 + AffectNet
    python train_emotion.py --fer-only          # train on FER2013 only (quick test)
    python train_emotion.py --epochs 30         # custom epoch count
    python train_emotion.py --batch-size 16     # smaller batch for low RAM
    python train_emotion.py --resume-from src/models/emotion_weights.pth --epochs 20
    python train_emotion.py --no-zoom-augment   # disable compression augmentation

Expects data at:
    data/fer2013/train/       (FER2013 images sorted by emotion folder)
    data/fer2013/test/        (FER2013 test split)
    data/affectnet/Train/     (AffectNet train images sorted by emotion folder)
    data/affectnet/Test/      (AffectNet test images sorted by emotion folder)

Outputs:
    src/models/emotion_weights.pth

Fine-tunes EfficientNet-B2 (pretrained on ImageNet) for 7-class emotion
classification. Optimized for Apple Silicon M2 with 8GB RAM.

Backbone options: efficientnet_b2 (default, best accuracy), efficientnet_b0,
mobilenetv2 (legacy). Input size: 224x224 (default) or 128 for legacy.
"""

import io
import os
import argparse
import gc
import random
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, ConcatDataset
from torchvision import transforms, models
from PIL import Image, ImageFilter
from sklearn.metrics import accuracy_score, classification_report

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FER2013_DIR = os.path.join(BASE_DIR, 'data', 'fer2013')
AFFECTNET_DIR = os.path.join(BASE_DIR, 'data', 'affectnet')
WEIGHTS_OUT = os.path.join(BASE_DIR, 'src', 'models', 'emotion_weights.pth')

# Emotion labels (shared across both datasets)
# FER2013 folder names map to these indices
EMOTION_LABELS = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']
EMOTION_TO_IDX = {label: idx for idx, label in enumerate(EMOTION_LABELS)}
NUM_CLASSES = 7

# AffectNet folder names differ from FER2013 — this maps them to our labels
AFFECTNET_FOLDER_MAP = {
    'anger': 'angry',
    'disgust': 'disgust',
    'fear': 'fear',
    'happy': 'happy',
    'sad': 'sad',
    'surprise': 'surprise',
    'neutral': 'neutral',
    # 'contempt' is skipped — not in our 7-class set
}

# Training config (optimized for M2 8GB)
IMG_SIZE = 224        # EfficientNet standard; was 128 for MobileNetV2
BACKBONE = 'efficientnet_b2'  # efficientnet_b2 | efficientnet_b0 | mobilenetv2
BATCH_SIZE = 16
EPOCHS = 40
LEARNING_RATE = 0.0001
DEVICE = 'mps' if torch.backends.mps.is_available() else 'cpu'
NUM_WORKERS = 2

# Backbone → (feature_dim, torchvision_constructor, weights)
BACKBONE_REGISTRY = {
    'efficientnet_b2': (1408, models.efficientnet_b2, models.EfficientNet_B2_Weights.DEFAULT),
    'efficientnet_b0': (1280, models.efficientnet_b0, models.EfficientNet_B0_Weights.DEFAULT),
    'mobilenetv2':     (1280, models.mobilenet_v2,    models.MobileNet_V2_Weights.DEFAULT),
}


# --- Compression augmentation transforms (simulate Zoom video artifacts) ---

class RandomJPEGCompression:
    """Simulate JPEG compression artifacts (Zoom H.264 → JPEG decode)."""
    def __init__(self, quality_range=(30, 85), p=0.6):
        self.quality_range = quality_range
        self.p = p

    def __call__(self, img):
        if random.random() > self.p:
            return img
        quality = random.randint(*self.quality_range)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=quality)
        buf.seek(0)
        return Image.open(buf).convert('RGB')


class RandomGaussianBlur:
    """Simulate codec smoothing / low-bitrate blur."""
    def __init__(self, radius_range=(1, 3), p=0.4):
        self.radius_range = radius_range
        self.p = p

    def __call__(self, img):
        if random.random() > self.p:
            return img
        radius = random.uniform(*self.radius_range)
        return img.filter(ImageFilter.GaussianBlur(radius=radius))


class RandomDownscaleUpscale:
    """Simulate low-resolution Zoom participant tiles."""
    def __init__(self, scale_range=(0.5, 0.8), p=0.4):
        self.scale_range = scale_range
        self.p = p

    def __call__(self, img):
        if random.random() > self.p:
            return img
        w, h = img.size
        scale = random.uniform(*self.scale_range)
        small = img.resize((int(w * scale), int(h * scale)), Image.BILINEAR)
        return small.resize((w, h), Image.BILINEAR)


def build_train_transform(zoom_augment=True):
    """Build training transform pipeline, optionally with compression augmentation."""
    augmentations = [
        transforms.Resize((IMG_SIZE + 16, IMG_SIZE + 16)),
        transforms.RandomCrop(IMG_SIZE),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
        transforms.RandomAffine(degrees=0, translate=(0.1, 0.1)),
    ]
    if zoom_augment:
        augmentations.extend([
            RandomJPEGCompression(quality_range=(30, 85), p=0.6),
            RandomGaussianBlur(radius_range=(1, 3), p=0.4),
            RandomDownscaleUpscale(scale_range=(0.5, 0.8), p=0.4),
        ])
    augmentations.extend([
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
        transforms.RandomErasing(p=0.15, scale=(0.02, 0.15)),
    ])
    return transforms.Compose(augmentations)


# Default transform (with zoom augmentation)
train_transform = build_train_transform(zoom_augment=True)

val_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


class FER2013Dataset(Dataset):
    """
    Load FER2013 from image folder structure:
        fer2013/train/angry/*.png
        fer2013/train/happy/*.png
        ...
    (Standard Kaggle format from msambare/fer2013)
    """
    def __init__(self, root_dir, split='train', transform=None):
        self.transform = transform
        self.samples = []

        split_dir = os.path.join(root_dir, split)
        if not os.path.isdir(split_dir):
            raise FileNotFoundError(
                f"FER2013 {split} directory not found at {split_dir}\n"
                f"Download from: https://www.kaggle.com/datasets/msambare/fer2013\n"
                f"Extract so the structure is: data/fer2013/train/<emotion>/*.png"
            )

        for emotion_name in sorted(os.listdir(split_dir)):
            emotion_dir = os.path.join(split_dir, emotion_name)
            if not os.path.isdir(emotion_dir):
                continue

            label = EMOTION_TO_IDX.get(emotion_name.lower())
            if label is None:
                continue

            for img_name in os.listdir(emotion_dir):
                if img_name.lower().endswith(('.png', '.jpg', '.jpeg')):
                    self.samples.append((
                        os.path.join(emotion_dir, img_name),
                        label
                    ))

        print(f"  FER2013 {split}: {len(self.samples)} images")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        img = Image.open(img_path).convert('RGB')
        if self.transform:
            img = self.transform(img)
        return img, label


class AffectNetDataset(Dataset):
    """
    Load AffectNet from image folder structure:
        affectnet/Train/anger/*.png
        affectnet/Train/happy/*.png
        ...
    Folder names are mapped to our 7-class labels via AFFECTNET_FOLDER_MAP.
    'contempt' folder is skipped.
    """
    def __init__(self, root_dir, split='Train', transform=None):
        self.transform = transform
        self.samples = []

        split_dir = os.path.join(root_dir, split)
        if not os.path.isdir(split_dir):
            raise FileNotFoundError(
                f"AffectNet {split} directory not found at {split_dir}\n"
                f"Download from: https://www.kaggle.com/datasets/mstjebashazida/affectnet\n"
                f"Extract so the structure is: data/affectnet/Train/<emotion>/*.png"
            )

        for folder_name in sorted(os.listdir(split_dir)):
            folder_path = os.path.join(split_dir, folder_name)
            if not os.path.isdir(folder_path):
                continue

            # Map AffectNet folder name to our emotion label
            mapped = AFFECTNET_FOLDER_MAP.get(folder_name.lower())
            if mapped is None:
                continue  # skip contempt and any unknown folders

            label = EMOTION_TO_IDX[mapped]

            for img_name in os.listdir(folder_path):
                if img_name.lower().endswith(('.png', '.jpg', '.jpeg')):
                    self.samples.append((
                        os.path.join(folder_path, img_name),
                        label
                    ))

        print(f"  AffectNet {split}: {len(self.samples)} images")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        try:
            img = Image.open(img_path).convert('RGB')
        except Exception:
            img = Image.new('RGB', (IMG_SIZE, IMG_SIZE))
        if self.transform:
            img = self.transform(img)
        return img, label


class EmotionNet(nn.Module):
    """Configurable backbone for 7-class emotion classification."""
    def __init__(self, num_classes=NUM_CLASSES, backbone_name=BACKBONE):
        super().__init__()
        self.backbone_name = backbone_name
        feat_dim, constructor, weights = BACKBONE_REGISTRY[backbone_name]

        backbone = constructor(weights=weights)

        if backbone_name.startswith('efficientnet'):
            self.features = backbone.features
            # Freeze early layers (stages 0-3 of 8)
            for param in list(self.features.parameters())[:len(list(self.features[:4].parameters()))]:
                param.requires_grad = False
        else:
            # MobileNetV2
            self.features = backbone.features
            for param in backbone.features[:10].parameters():
                param.requires_grad = False

        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.4),
            nn.Linear(feat_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes),
        )

    def forward(self, x):
        x = self.features(x)
        x = self.pool(x)
        x = self.classifier(x)
        return x


def get_class_weights(dataset):
    """Compute class weights to handle emotion imbalance."""
    labels = []
    for ds in (dataset.datasets if isinstance(dataset, ConcatDataset) else [dataset]):
        if hasattr(ds, 'samples'):
            labels.extend([s[1] for s in ds.samples])
        elif hasattr(ds, 'dataset') and hasattr(ds.dataset, 'samples'):
            labels.extend([ds.dataset.samples[i][1] for i in ds.indices])

    counts = np.bincount(labels, minlength=NUM_CLASSES).astype(np.float32)
    # Inverse frequency weighting
    weights = 1.0 / (counts + 1e-6)
    weights = weights / weights.sum() * NUM_CLASSES
    return torch.tensor(weights, dtype=torch.float32)


def mixup_data(x, y, alpha=0.2):
    """Mixup augmentation: blend pairs of images and labels."""
    if alpha > 0:
        lam = np.random.beta(alpha, alpha)
    else:
        lam = 1.0
    batch_size = x.size(0)
    index = torch.randperm(batch_size, device=x.device)
    mixed_x = lam * x + (1 - lam) * x[index]
    y_a, y_b = y, y[index]
    return mixed_x, y_a, y_b, lam


def mixup_criterion(criterion, pred, y_a, y_b, lam):
    """Compute loss for mixup-blended batch."""
    return lam * criterion(pred, y_a) + (1 - lam) * criterion(pred, y_b)


def train(args):
    # Rebuild train transform based on --zoom-augment flag
    global train_transform, IMG_SIZE
    img_size = args.img_size
    IMG_SIZE = img_size
    train_transform = build_train_transform(zoom_augment=args.zoom_augment)

    print(f'=== Emotion Model Training ===')
    print(f'Backbone: {args.backbone}')
    print(f'Device: {DEVICE}')
    print(f'Batch size: {args.batch_size}')
    print(f'Epochs: {args.epochs}')
    print(f'Image size: {img_size}x{img_size}')
    print(f'Zoom augmentation: {args.zoom_augment}')
    print(f'Mixup alpha: {args.mixup_alpha}')
    if args.resume_from:
        print(f'Resuming from: {args.resume_from}')
    print()

    # Load datasets
    print('Loading datasets...')
    train_datasets = []
    val_datasets = []

    # FER2013 (always included)
    fer_train = FER2013Dataset(FER2013_DIR, split='train', transform=train_transform)
    fer_val = FER2013Dataset(FER2013_DIR, split='test', transform=val_transform)
    train_datasets.append(fer_train)
    val_datasets.append(fer_val)

    # AffectNet (unless --fer-only)
    if not args.fer_only:
        try:
            affect_train = AffectNetDataset(AFFECTNET_DIR, split='Train', transform=train_transform)
            affect_val = AffectNetDataset(AFFECTNET_DIR, split='Test', transform=val_transform)
            train_datasets.append(affect_train)
            val_datasets.append(affect_val)
        except FileNotFoundError as e:
            print(f'\n  WARNING: {e}')
            print('  Continuing with FER2013 only.\n')

    # Combine datasets
    train_dataset = ConcatDataset(train_datasets) if len(train_datasets) > 1 else train_datasets[0]
    val_dataset = ConcatDataset(val_datasets) if len(val_datasets) > 1 else val_datasets[0]

    print(f'\nTotal train: {len(train_dataset)} | Val: {len(val_dataset)}\n')

    # Class weights for imbalanced emotions
    class_weights = get_class_weights(train_dataset).to(DEVICE)
    print(f'Class weights: {dict(zip(EMOTION_LABELS, class_weights.cpu().numpy().round(2)))}')

    # Data loaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=NUM_WORKERS,
        pin_memory=False,   # save RAM on 8GB machine
        drop_last=True,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=NUM_WORKERS,
        pin_memory=False,
    )

    # Model
    model = EmotionNet(backbone_name=args.backbone).to(DEVICE)

    # Resume from existing checkpoint (warm start) — only if same backbone
    if args.resume_from:
        checkpoint = torch.load(args.resume_from, weights_only=False, map_location=DEVICE)
        ckpt_backbone = checkpoint.get('backbone', 'mobilenetv2')
        if ckpt_backbone == args.backbone:
            model.load_state_dict(checkpoint['model_state_dict'])
            prev_acc = checkpoint.get('val_acc', 'unknown')
            prev_epoch = checkpoint.get('epoch', 'unknown')
            print(f'Loaded checkpoint: epoch {prev_epoch}, val_acc {prev_acc}')
            print('Optimizer/scheduler reset for new augmentation regime.\n')
        else:
            print(f'Checkpoint backbone ({ckpt_backbone}) != current ({args.backbone}), training from scratch.\n')

    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f'Total params: {total_params:,} | Trainable: {trainable_params:,}\n')

    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.1)
    optimizer = optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.learning_rate,
        weight_decay=0.01,
    )
    scheduler = optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=10, T_mult=2, eta_min=1e-6
    )

    best_val_acc = 0.0
    patience_counter = 0
    patience_limit = 7

    for epoch in range(args.epochs):
        # --- Train ---
        model.train()
        train_loss = 0.0
        train_preds, train_labels = [], []

        use_mixup = args.mixup_alpha > 0

        for batch_idx, (images, labels) in enumerate(train_loader):
            images, labels = images.to(DEVICE), labels.to(DEVICE)

            optimizer.zero_grad()
            if use_mixup:
                mixed_images, y_a, y_b, lam = mixup_data(images, labels, args.mixup_alpha)
                outputs = model(mixed_images)
                loss = mixup_criterion(criterion, outputs, y_a, y_b, lam)
            else:
                outputs = model(images)
                loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            preds = outputs.argmax(dim=1)
            train_preds.extend(preds.cpu().numpy())
            train_labels.extend(labels.cpu().numpy())

            if (batch_idx + 1) % 100 == 0:
                print(f'  Epoch {epoch+1} | Batch {batch_idx+1}/{len(train_loader)} | Loss: {loss.item():.4f}')

        train_acc = accuracy_score(train_labels, train_preds)
        avg_train_loss = train_loss / len(train_loader)

        # --- Validate ---
        model.eval()
        val_preds, val_labels_list = [], []
        val_loss = 0.0

        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(DEVICE), labels.to(DEVICE)
                outputs = model(images)
                loss = criterion(outputs, labels)
                val_loss += loss.item()
                preds = outputs.argmax(dim=1)
                val_preds.extend(preds.cpu().numpy())
                val_labels_list.extend(labels.cpu().numpy())

        val_acc = accuracy_score(val_labels_list, val_preds)
        avg_val_loss = val_loss / len(val_loader)
        scheduler.step(epoch)

        current_lr = optimizer.param_groups[0]['lr']
        print(f'Epoch {epoch+1}/{args.epochs} | '
              f'Train Loss: {avg_train_loss:.4f} Acc: {train_acc:.4f} | '
              f'Val Loss: {avg_val_loss:.4f} Acc: {val_acc:.4f} | '
              f'LR: {current_lr:.6f}')

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save({
                'model_state_dict': model.state_dict(),
                'emotion_labels': EMOTION_LABELS,
                'img_size': img_size,
                'backbone': args.backbone,
                'num_classes': NUM_CLASSES,
                'val_acc': val_acc,
                'epoch': epoch + 1,
            }, WEIGHTS_OUT)
            print(f'  -> Saved best model (val_acc: {val_acc:.4f})')
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience_limit:
                print(f'\nEarly stopping at epoch {epoch+1} (no improvement for {patience_limit} epochs)')
                break

        # Free memory each epoch
        gc.collect()
        if DEVICE == 'mps':
            torch.mps.empty_cache()

    # --- Final Evaluation ---
    print(f'\n=== Final Evaluation ===')
    checkpoint = torch.load(WEIGHTS_OUT, weights_only=False, map_location=DEVICE)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()

    val_preds, val_labels_list = [], []
    with torch.no_grad():
        for images, labels in val_loader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            outputs = model(images)
            preds = outputs.argmax(dim=1)
            val_preds.extend(preds.cpu().numpy())
            val_labels_list.extend(labels.cpu().numpy())

    print(classification_report(
        val_labels_list, val_preds,
        target_names=EMOTION_LABELS,
        zero_division=0
    ))
    print(f'Best Val Accuracy: {best_val_acc:.4f}')
    print(f'Weights saved to: {WEIGHTS_OUT}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train emotion recognition model')
    parser.add_argument('--backbone', type=str, default=BACKBONE,
                        choices=list(BACKBONE_REGISTRY.keys()),
                        help=f'Backbone architecture (default: {BACKBONE})')
    parser.add_argument('--img-size', type=int, default=IMG_SIZE,
                        help=f'Input image size (default: {IMG_SIZE})')
    parser.add_argument('--fer-only', action='store_true',
                        help='Train on FER2013 only (skip AffectNet)')
    parser.add_argument('--epochs', type=int, default=EPOCHS,
                        help=f'Number of epochs (default: {EPOCHS})')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE,
                        help=f'Batch size (default: {BATCH_SIZE})')
    parser.add_argument('--learning-rate', type=float, default=LEARNING_RATE,
                        help=f'Learning rate (default: {LEARNING_RATE})')
    parser.add_argument('--resume-from', type=str, default=None,
                        help='Path to checkpoint to resume from (warm start, same backbone only)')
    parser.add_argument('--zoom-augment', action=argparse.BooleanOptionalAction, default=True,
                        help='Enable compression augmentation for Zoom robustness (default: on)')
    parser.add_argument('--mixup-alpha', type=float, default=0.2,
                        help='Mixup alpha (0 to disable, default: 0.2)')
    args = parser.parse_args()
    train(args)
