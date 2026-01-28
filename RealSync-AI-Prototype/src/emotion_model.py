import cv2
import os
import numpy as np
import os

USE_FER = os.environ.get("REALSYNC_USE_FER") == "1"
_detector = None

LABEL_MAP = {
    "angry": "Angry",
    "fear": "Fear",
    "happy": "Happy",
    "sad": "Sad",
    "surprise": "Surprise",
    "neutral": "Neutral",
}

def get_detector():
    global _detector
    if not USE_FER:
        return None
    if _detector is None:
        try:
            from fer import FER
            _detector = FER(mtcnn=True)
        except Exception as exc:
            print(f"FER model unavailable, falling back to heuristic emotions. ({exc})")
            return None
    return _detector

def heuristic_emotions(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray)) / 255.0
    contrast = float(np.std(gray)) / 255.0

    scores = {
        "Happy": brightness * 0.6 + contrast * 0.1 + 0.1,
        "Neutral": 0.3 + (1 - abs(0.5 - brightness)) * 0.2,
        "Angry": contrast * 0.3 + (1 - brightness) * 0.1,
        "Fear": (1 - contrast) * 0.2 + (1 - brightness) * 0.1,
        "Surprise": contrast * 0.4 + brightness * 0.1,
        "Sad": (1 - brightness) * 0.6 + contrast * 0.1,
    }

    total = sum(scores.values()) or 1.0
    return {label: value / total for label, value in scores.items()}

def emotion_analysis(face_dir):
    scores = []
    processed = 0
    errors = 0
    totals = {label: 0.0 for label in LABEL_MAP.values()}

    detector = get_detector()

    for img_name in sorted(os.listdir(face_dir)):
        # Skip non-image files
        if not img_name.endswith(('.jpg', '.jpeg', '.png')):
            continue

        img_path = os.path.join(face_dir, img_name)
        img = cv2.imread(img_path)

        # Skip if image failed to load
        if img is None:
            errors += 1
            continue

        try:
            if detector is None:
                emotion_dict = heuristic_emotions(img)
                max_emotion = max(emotion_dict.values())
                scores.append(max_emotion)
                for label, value in emotion_dict.items():
                    totals[label] += float(value)
                processed += 1
            else:
                emotions = detector.detect_emotions(img)

                if emotions and len(emotions) > 0:
                    emotion_dict = emotions[0]["emotions"]
                    max_emotion = max(emotion_dict.values())
                    scores.append(max_emotion)

                    for raw_label, mapped_label in LABEL_MAP.items():
                        totals[mapped_label] += float(emotion_dict.get(raw_label, 0.0))

                    processed += 1

        except Exception:
            errors += 1
            continue

    print(f"Emotion analysis: processed {processed} faces, {errors} errors")

    if processed == 0:
        return {
            "score": 0.0,
            "label": "Neutral",
            "confidence": 0.0,
            "scores": {label: 0.0 for label in LABEL_MAP.values()},
        }

    averages = {label: value / processed for label, value in totals.items()}
    total = sum(averages.values())
    if total > 0:
        averages = {label: value / total for label, value in averages.items()}

    label = max(averages, key=averages.get)
    confidence = float(averages[label])

    return {
        "score": float(np.mean(scores)) if scores else 0.0,
        "label": label,
        "confidence": confidence,
        "scores": averages,
    }


def emotion_score(face_dir):
    return emotion_analysis(face_dir)["score"]
