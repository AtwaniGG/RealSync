import os
import json

from extract_frames import extract_frames
from face_detection import detect_faces
from audio_extract import extract_audio_chunks
from video_model import video_deepfake_score
from emotion_model import emotion_analysis

BASE = os.path.dirname(os.path.dirname(__file__))

input_video = f"{BASE}/input/meeting.mp4"
frames = f"{BASE}/output/frames"
faces = f"{BASE}/output/faces"
audio = f"{BASE}/output/audio"

extract_frames(input_video, frames)
detect_faces(frames, faces)
extract_audio_chunks(input_video, audio)

video_score = video_deepfake_score(faces)
emotion = emotion_analysis(faces)
audio_score = 0.0  # demo placeholder

emotion_score = float(emotion["score"])
trust = round(1 - (0.5*video_score + 0.3*emotion_score + 0.2*audio_score), 2)

results = {
    "video_score": round(video_score, 2),
    "emotion_score": round(emotion_score, 2),
    "emotion_label": emotion["label"],
    "emotion_confidence": round(float(emotion["confidence"]), 3),
    "emotion_scores": {
        label: round(float(value), 3) for label, value in emotion["scores"].items()
    },
    "audio_score": audio_score,
    "trust_score": trust
}

with open(f"{BASE}/output/results.json", "w") as f:
    json.dump(results, f, indent=2)

print(results)
