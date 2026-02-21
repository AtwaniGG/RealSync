#!/usr/bin/env python
"""
Train emotion recognition model using FER2013 + ExpW datasets.

Usage:
    python train_emotion.py
    python train_emotion.py --fer-only          # train on FER2013 only (quick test)
    python train_emotion.py --epochs 30         # custom epoch count
    python train_emotion.py --batch-size 16     # smaller batch for low RAM

Expects data at:
    data/fer2013/train/       (FER2013 images sorted by emotion folder)
    data/fer2013/test/        (FER2013 test split)
    data/ExpW/                (ExpW images + label/label.lst)

Outputs:
    src/models/emotion_weights.pth

Fine-tunes MobileNetV2 (pretrained on ImageNet) for 7-class emotion
classification. Optimized for Apple Silicon M2 with 8GB RAM.
"""

import os
import argparse
import gc
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, ConcatDataset, WeightedRandomSampler
from torchvision import transforms, models
from PIL import Image
from sklearn.metrics import accuracy_score, classification_report

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FER2013_DIR = os.path.join(BASE_DIR, 'data', 'fer2013')
EXPW_DIR = os.path.join(BASE_DIR, 'data', 'ExpW')
WEIGHTS_OUT = os.path.join(BASE_DIR, 'src', 'models', 'emotion_weights.pth')

# Emotion labels (shared across both datasets)
# FER2013 folder names map to these indices
EMOTION_LABELS = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']
EMOTION_TO_IDX = {label: idx for idx, label in enumerate(EMOTION_LABELS)}
NUM_CLASSES = 7

# ExpW uses integer labels in its label file:
# 0=angry, 1=disgust, 2=fear, 3=happy, 4=sad, 5=surprise, 6=neutral
# This matches our EMOTION_LABELS order exactly.

# Training config (optimized for M2 8GB)
IMG_SIZE = 96
BATCH_SIZE = 32
EPOCHS = 25
LEARNING_RATE = 0.0003
DEVICE = 'mps' if torch.backends.mps.is_available() else 'cpu'
NUM_WORKERS = 2


# Data augmentation
train_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(10),
    transforms.ColorJitter(brightness=0.2, contrast=0.2),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

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


class ExpWDataset(Dataset):
    """
    Load ExpW dataset.
    Expects:
        ExpW/origin/             (image files)
        ExpW/label/label.lst     (label file: filename face_id x y w h label)
    """
    def __init__(self, root_dir, transform=None):
        self.transform = transform
        self.samples = []

        image_dir = os.path.join(root_dir, 'origin')
        label_file = os.path.join(root_dir, 'label', 'label.lst')

        if not os.path.isfile(label_file):
            raise FileNotFoundError(
                f"ExpW label file not found at {label_file}\n"
                f"Download from Kaggle: Expression in-the-Wild (ExpW) Dataset\n"
                f"Extract so the structure is: data/ExpW/origin/*.jpg + data/ExpW/label/label.lst"
            )

        # Parse label file - each line: filename face_id x y w h label
        seen = set()
        with open(label_file, 'r') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) < 7:
                    continue

                filename = parts[0]
                label = int(parts[6])

                # Only use first face per image, skip duplicates
                if filename in seen:
                    continue
                seen.add(filename)

                if label < 0 or label >= NUM_CLASSES:
                    continue

                img_path = os.path.join(image_dir, filename)
                if os.path.isfile(img_path):
                    self.samples.append((img_path, label))

        print(f"  ExpW: {len(self.samples)} images")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        try:
            img = Image.open(img_path).convert('RGB')
        except Exception:
            # Return a blank image on read error rather than crashing
            img = Image.new('RGB', (IMG_SIZE, IMG_SIZE))
        if self.transform:
            img = self.transform(img)
        return img, label


class EmotionNet(nn.Module):
    """MobileNetV2 fine-tuned for 7-class emotion classification."""
    def __init__(self, num_classes=NUM_CLASSES):
        super().__init__()
        backbone = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)

        # Freeze early layers to save memory and speed up training
        for param in backbone.features[:14].parameters():
            param.requires_grad = False

        self.features = backbone.features
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(1280, num_classes),
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
        labels.extend([s[1] for s in ds.samples])

    counts = np.bincount(labels, minlength=NUM_CLASSES).astype(np.float32)
    # Inverse frequency weighting
    weights = 1.0 / (counts + 1e-6)
    weights = weights / weights.sum() * NUM_CLASSES
    return torch.tensor(weights, dtype=torch.float32)


def train(args):
    print(f'=== Emotion Model Training ===')
    print(f'Device: {DEVICE}')
    print(f'Batch size: {args.batch_size}')
    print(f'Epochs: {args.epochs}')
    print(f'Image size: {IMG_SIZE}x{IMG_SIZE}')
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

    # ExpW (unless --fer-only)
    if not args.fer_only:
        try:
            expw_full = ExpWDataset(EXPW_DIR, transform=train_transform)
            # Split ExpW: 90% train, 10% val
            n_val = int(len(expw_full) * 0.1)
            n_train = len(expw_full) - n_val
            expw_train, expw_val = torch.utils.data.random_split(
                expw_full, [n_train, n_val],
                generator=torch.Generator().manual_seed(42)
            )
            # Wrap val split with val_transform
            expw_val.dataset = ExpWDataset(EXPW_DIR, transform=val_transform)
            train_datasets.append(expw_train)
            val_datasets.append(expw_val)
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
    model = EmotionNet().to(DEVICE)
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f'Total params: {total_params:,} | Trainable: {trainable_params:,}\n')

    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.learning_rate,
    )
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', patience=3, factor=0.5, min_lr=1e-6
    )

    best_val_acc = 0.0
    patience_counter = 0
    patience_limit = 7

    for epoch in range(args.epochs):
        # --- Train ---
        model.train()
        train_loss = 0.0
        train_preds, train_labels = [], []

        for batch_idx, (images, labels) in enumerate(train_loader):
            images, labels = images.to(DEVICE), labels.to(DEVICE)

            optimizer.zero_grad()
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
        scheduler.step(avg_val_loss)

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
                'img_size': IMG_SIZE,
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
    parser.add_argument('--fer-only', action='store_true',
                        help='Train on FER2013 only (skip ExpW)')
    parser.add_argument('--epochs', type=int, default=EPOCHS,
                        help=f'Number of epochs (default: {EPOCHS})')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE,
                        help=f'Batch size (default: {BATCH_SIZE})')
    parser.add_argument('--learning-rate', type=float, default=LEARNING_RATE,
                        help=f'Learning rate (default: {LEARNING_RATE})')
    args = parser.parse_args()
    train(args)
