import cv2
import os

USE_MEDIAPIPE = os.environ.get("REALSYNC_USE_MEDIAPIPE") == "1"
_mp_face = None
_haar = None

def get_mediapipe_detector():
    global _mp_face
    if not USE_MEDIAPIPE:
        return None
    if _mp_face is None:
        try:
            import mediapipe as mp
            if not hasattr(mp, "solutions"):
                print("mediapipe.solutions not available, falling back to OpenCV.")
                return None
            _mp_face = mp.solutions.face_detection.FaceDetection(
                model_selection=1,
                min_detection_confidence=0.5
            )
        except Exception as exc:
            print(f"Failed to initialize mediapipe, falling back to OpenCV. ({exc})")
            return None
    return _mp_face

def get_haar_detector():
    global _haar
    if _haar is None:
        _haar = cv2.CascadeClassifier(
            os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        )
    return _haar

def detect_faces(frame_dir, output_dir, padding_percent=0.3):
    """
    Detect and crop faces from video frames.

    Args:
        frame_dir: Directory containing video frames
        output_dir: Directory to save cropped faces
        padding_percent: Percentage of face size to add as padding (0.3 = 30%)
    """
    os.makedirs(output_dir, exist_ok=True)

    face_count = 0

    mp_face = get_mediapipe_detector()
    haar = get_haar_detector()

    for img_name in sorted(os.listdir(frame_dir)):
        if not img_name.endswith(('.jpg', '.jpeg', '.png')):
            continue

        img_path = os.path.join(frame_dir, img_name)
        img = cv2.imread(img_path)

        if img is None:
            continue

        h, w, _ = img.shape
        detections = []

        if mp_face is not None:
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = mp_face.process(rgb)
            detections = results.detections or []
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = haar.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4)
            for (x, y, bw, bh) in faces:
                detections.append((x, y, bw, bh))

        if not detections:
            # Fallback: crop center region to keep pipeline moving
            size = min(h, w)
            x1 = (w - size) // 2
            y1 = (h - size) // 2
            detections = [(x1, y1, size, size)]

        for i, det in enumerate(detections):
            if mp_face is not None:
                confidence = det.score[0]
                if confidence < 0.5:
                    continue
                box = det.location_data.relative_bounding_box
                x = int(box.xmin * w)
                y = int(box.ymin * h)
                bw = int(box.width * w)
                bh = int(box.height * h)
            else:
                x, y, bw, bh = det
                confidence = 0.7

            pad_w = int(bw * padding_percent)
            pad_h = int(bh * padding_percent)

            x1 = max(0, x - pad_w)
            y1 = max(0, y - pad_h)
            x2 = min(w, x + bw + pad_w)
            y2 = min(h, y + bh + pad_h)

            face = img[y1:y2, x1:x2]

            if face.size == 0 or face.shape[0] < 20 or face.shape[1] < 20:
                continue

            face_resized = cv2.resize(face, (224, 224))

            base_name = os.path.splitext(img_name)[0]
            output_path = f"{output_dir}/{base_name}_person{i}_conf{int(confidence*100)}.jpg"
            cv2.imwrite(output_path, face_resized)

            face_count += 1

    print(f"Detected and saved {face_count} faces from {len(os.listdir(frame_dir))} frames")
