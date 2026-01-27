import cv2
import numpy as np
import os
import random

def video_deepfake_score(face_dir):
    # Filter for image files only
    faces = [f for f in os.listdir(face_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]

    if len(faces) == 0:
        return 0.0

    # DEMO logic: simulate deepfake confidence
    scores = [random.uniform(0.4, 0.9) for _ in faces]
    return float(np.mean(scores))
