const express = require("express");
const cors = require("cors");
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 4000;

const EMOTIONS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toFixedNumber = (value, digits = 4) =>
  Number.parseFloat(value.toFixed(digits));
const toNumber = (value, fallback = 0) =>
  typeof value === "number" && !Number.isNaN(value) ? value : fallback;

const DEFAULT_RESULTS_PATH =
  process.env.RESULTS_PATH ??
  path.resolve(__dirname, "../RealSync-AI-Prototype/output/results.json");

let latestMetrics = null;
let broadcastInterval = null;
let resultsFileMtime = 0;

const generateSimulatedMetrics = () => {
  const now = new Date();
  const phase = now.getTime() / 1000;

  const wave = (speed, offset = 0) =>
    (Math.sin(phase / speed + offset) + 1) / 2;

  const dominantIndex = Math.min(
    EMOTIONS.length - 1,
    Math.floor(wave(9, 1.3) * EMOTIONS.length)
  );

  const weights = EMOTIONS.map((_, index) => 0.35 + 0.65 * wave(7, index));
  weights[dominantIndex] += 1.25;

  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const scores = EMOTIONS.reduce((acc, label, index) => {
    acc[label] = toFixedNumber(weights[index] / weightSum);
    return acc;
  }, {});

  const emotionLabel = EMOTIONS[dominantIndex];
  const emotionConfidence = scores[emotionLabel];

  const embeddingShift = clamp(0.08 + 0.35 * wave(6, 2.1), 0.03, 0.65);
  const identityRisk =
    embeddingShift < 0.2 ? "low" : embeddingShift < 0.4 ? "medium" : "high";

  const authenticityScore = clamp(0.82 + 0.16 * wave(8, 0.7), 0.55, 0.98);
  const deepfakeRisk =
    authenticityScore > 0.85 ? "low" : authenticityScore > 0.7 ? "medium" : "high";

  const audioConfidence = clamp(0.9 + 0.08 * wave(5, 0.4), 0.7, 0.99);
  const videoConfidence = clamp(1 - embeddingShift + 0.03 * wave(4, 1.1), 0.6, 0.99);
  const behaviorConfidence = clamp(0.55 + emotionConfidence * 0.4, 0.5, 0.95);

  const trustScore = clamp(
    (authenticityScore + audioConfidence + videoConfidence + behaviorConfidence) / 4,
    0,
    1
  );

  return {
    timestamp: now.toISOString(),
    source: "simulated",
    emotion: {
      label: emotionLabel,
      confidence: toFixedNumber(emotionConfidence),
      scores,
    },
    identity: {
      samePerson: embeddingShift < 0.25,
      embeddingShift: toFixedNumber(embeddingShift),
      riskLevel: identityRisk,
    },
    deepfake: {
      authenticityScore: toFixedNumber(authenticityScore),
      model: "XceptionNet + EfficientNet (simulated)",
      riskLevel: deepfakeRisk,
    },
    trustScore: toFixedNumber(trustScore),
    confidenceLayers: {
      audio: toFixedNumber(audioConfidence),
      video: toFixedNumber(videoConfidence),
      behavior: toFixedNumber(behaviorConfidence),
    },
  };
};

const getCurrentMetrics = () => latestMetrics ?? generateSimulatedMetrics();

const deriveMetrics = (payload) => {
  const emotionLabel =
    typeof payload?.emotion?.label === "string" && EMOTIONS.includes(payload.emotion.label)
      ? payload.emotion.label
      : "Neutral";
  const emotionConfidence =
    typeof payload?.emotion?.confidence === "number" ? payload.emotion.confidence : 0.5;
  const embeddingShift =
    typeof payload?.identity?.embeddingShift === "number" ? payload.identity.embeddingShift : 0.3;
  const authenticityScore =
    typeof payload?.deepfake?.authenticityScore === "number"
      ? payload.deepfake.authenticityScore
      : 0.8;

  const emotionScores =
    payload?.emotion?.scores ??
    EMOTIONS.reduce((acc, label) => {
      acc[label] = label === emotionLabel ? emotionConfidence : toFixedNumber(0.02);
      return acc;
    }, {});

  const confidenceLayers = payload.confidenceLayers ?? {
    audio: clamp(0.85 + authenticityScore * 0.1, 0, 1),
    video: clamp(1 - embeddingShift, 0, 1),
    behavior: clamp(0.5 + emotionConfidence * 0.5, 0, 1),
  };

  const trustScore =
    typeof payload.trustScore === "number"
      ? payload.trustScore
      : clamp(
          (authenticityScore +
            confidenceLayers.audio +
            confidenceLayers.video +
            confidenceLayers.behavior) /
            4,
          0,
          1
        );

  return {
    ...payload,
    emotion: {
      ...(payload.emotion ?? {}),
      label: emotionLabel,
      confidence: toFixedNumber(emotionConfidence),
      scores: emotionScores,
    },
    confidenceLayers,
    trustScore: toFixedNumber(trustScore),
  };
};

const riskFromScore = (score) => {
  if (score >= 0.85) return "low";
  if (score >= 0.7) return "medium";
  return "high";
};

const normalizeEmotionScores = (scores) => {
  if (!scores || typeof scores !== "object") return null;
  const mapped = {};
  let total = 0;
  EMOTIONS.forEach((label) => {
    const lower = label.toLowerCase();
    const value = toNumber(scores[label], toNumber(scores[lower], 0));
    mapped[label] = value;
    total += value;
  });

  if (total > 0) {
    EMOTIONS.forEach((label) => {
      mapped[label] = mapped[label] / total;
    });
  }

  return mapped;
};

const buildEmotionScores = (dominantLabel, dominantConfidence) => {
  const remaining = clamp(1 - dominantConfidence, 0, 1);
  const per = EMOTIONS.length > 1 ? remaining / (EMOTIONS.length - 1) : 0;
  return EMOTIONS.reduce((acc, label) => {
    acc[label] = toFixedNumber(label === dominantLabel ? dominantConfidence : per);
    return acc;
  }, {});
};

const mapResultsToMetrics = (results) => {
  const videoScore = clamp(toNumber(results?.video_score, 0), 0, 1);
  const emotionScore = clamp(toNumber(results?.emotion_score, 0), 0, 1);
  const audioScore = clamp(toNumber(results?.audio_score, 0), 0, 1);
  const trustScore = clamp(toNumber(results?.trust_score, 0), 0, 1);

  const authenticityScore = clamp(1 - videoScore, 0, 1);
  const behaviorConfidence = clamp(1 - emotionScore, 0, 1);
  const audioConfidence = clamp(1 - audioScore, 0, 1);

  const normalizedScores = normalizeEmotionScores(results?.emotion_scores);
  const providedLabel =
    typeof results?.emotion_label === "string" ? results.emotion_label.trim() : null;
  const safeLabel = providedLabel
    ? EMOTIONS.find((label) => label.toLowerCase() === providedLabel.toLowerCase()) ?? null
    : null;
  const fallbackLabel = normalizedScores
    ? Object.entries(normalizedScores).sort((a, b) => b[1] - a[1])[0]?.[0]
    : "Neutral";
  const emotionLabel = safeLabel ?? fallbackLabel ?? "Neutral";
  const emotionConfidence = clamp(
    toNumber(results?.emotion_confidence, normalizedScores?.[emotionLabel] ?? behaviorConfidence),
    0,
    1
  );
  const emotionScores =
    normalizedScores ?? buildEmotionScores(emotionLabel, emotionConfidence);

  const payload = {
    timestamp: new Date().toISOString(),
    source: "external",
    emotion: {
      label: emotionLabel,
      confidence: emotionConfidence,
      scores: emotionScores,
    },
    identity: {
      samePerson: true,
      embeddingShift: toFixedNumber(clamp(1 - behaviorConfidence, 0, 1)),
      riskLevel: "low",
    },
    deepfake: {
      authenticityScore,
      model: "MesoNet-4",
      riskLevel: riskFromScore(authenticityScore),
    },
    trustScore,
    confidenceLayers: {
      audio: audioConfidence,
      video: authenticityScore,
      behavior: behaviorConfidence,
    },
  };

  return deriveMetrics(payload);
};

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

const broadcastMetrics = (metrics) => {
  const message = JSON.stringify({ type: "metrics", data: metrics });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

const updateMetricsFromResultsFile = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const results = JSON.parse(raw);
    const mapped = mapResultsToMetrics(results);
    latestMetrics = {
      ...mapped,
      timestamp: mapped.timestamp ?? new Date().toISOString(),
      source: "external",
    };
    broadcastMetrics(latestMetrics);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "metrics", data: getCurrentMetrics() }));
});

const ensureBroadcastLoop = () => {
  if (broadcastInterval) return;
  broadcastInterval = setInterval(() => {
    broadcastMetrics(getCurrentMetrics());
  }, 2000);
};

ensureBroadcastLoop();

setInterval(() => {
  fs.stat(DEFAULT_RESULTS_PATH, (err, stats) => {
    if (err || !stats?.mtimeMs) return;
    if (stats.mtimeMs <= resultsFileMtime) return;
    resultsFileMtime = stats.mtimeMs;
    updateMetricsFromResultsFile(DEFAULT_RESULTS_PATH);
  });
}, 1000);

app.get("/", (req, res) => {
  res.json({ status: "RealSync backend running" });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/models", (req, res) => {
  const usingExternal = Boolean(latestMetrics);
  res.json({
    mode: usingExternal ? "external" : "simulated",
    updatedAt: latestMetrics?.timestamp ?? null,
    models: {
      emotion: {
        name: "FER2013 / AffectNet CNN",
        status: usingExternal ? "external" : "simulated",
      },
      identity: {
        name: "FaceNet / InsightFace",
        status: usingExternal ? "external" : "simulated",
      },
      deepfake: {
        name: "XceptionNet + EfficientNet",
        status: usingExternal ? "external" : "simulated",
      },
    },
  });
});

app.get("/api/metrics", (req, res) => {
  res.json(getCurrentMetrics());
});

app.post("/api/metrics/from-file", (req, res) => {
  const filePath = req.body?.path
    ? path.resolve(req.body.path)
    : DEFAULT_RESULTS_PATH;
  const result = updateMetricsFromResultsFile(filePath);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, path: filePath });
  }
  return res.json({ status: "ok", path: filePath });
});

app.post("/api/metrics", (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid payload." });
  }

  const requiredFields = ["emotion", "identity", "deepfake"];
  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  latestMetrics = {
    ...deriveMetrics(payload),
    timestamp: payload.timestamp ?? new Date().toISOString(),
    source: "external",
  };

  broadcastMetrics(latestMetrics);
  return res.json({ status: "ok", storedAt: latestMetrics.timestamp });
});

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
