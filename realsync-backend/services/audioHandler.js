const { analyzeAudio, transcribeAudio } = require("../lib/aiClient");
const { createSttStream } = require("../lib/gcpStt");
const { broadcastToSession, makeIso } = require("./sessionManager");
const { handleTranscript } = require("./transcriptHandler");
const log = require("../lib/logger");

const MAX_AUDIO_BUFFER_CHUNKS = 128;
const AUDIO_ANALYSIS_INTERVAL_MS = 3_000;
const AUDIO_DEEPFAKE_ENABLED = process.env.AUDIO_DEEPFAKE_ENABLED !== "false";
const RMS_SILENCE_THRESHOLD = 500; // PCM16 range -32768..32767; below this = silence

// Audio score decay: hold last score for 20s, then decay to 0 over 20s
const _lastAudioScores = new Map(); // sessionId → { score: number, ts: number }

/**
 * Returns an effective audio authenticity score that smooths over silent periods.
 * If currentScore > 0.1: updates the held value and returns it directly.
 * Within 20 s of the last real score: returns the last held value unchanged.
 * Between 20–40 s: linearly decays the held value to 0.
 * After 40 s: evicts the entry and returns 0.
 *
 * @param {string} sessionId
 * @param {number} currentScore  Raw score from the AI pipeline (0–1).
 * @returns {number}
 */
function getEffectiveAudioScore(sessionId, currentScore) {
  if (currentScore > 0.1) {
    _lastAudioScores.set(sessionId, { score: currentScore, ts: Date.now() });
    return currentScore;
  }
  const last = _lastAudioScores.get(sessionId);
  if (!last) return 0;
  const elapsed = (Date.now() - last.ts) / 1000;
  if (elapsed < 20) return last.score;
  if (elapsed < 40) return Math.round(last.score * (1 - (elapsed - 20) / 20) * 100) / 100;
  _lastAudioScores.delete(sessionId);
  return 0;
}

/**
 * Combine base64 audio chunks into a single base64 string.
 */
function combineAudioChunks(chunks) {
  return Buffer.concat(chunks.map(b64 => Buffer.from(b64, "base64"))).toString("base64");
}

/**
 * Process a single base64 PCM chunk:
 *  - feeds it to the GCP STT stream
 *  - accumulates it for periodic AI deepfake + Whisper analysis
 */
function processAudioChunk(session, dataB64) {
  if (!session.stt) {
    session.stt = createSttStream({
      onTranscript: (t) => handleTranscript(session, t),
      onError: (err) => {
        log.warn("stt", `STT error for session ${session.id}: ${err?.message ?? err}`);
        session.stt = null;
      },
    });
  }

  const audioBuffer = Buffer.from(dataB64, "base64");
  session.stt.write(audioBuffer);

  // Accumulate audio for AI deepfake analysis (H3: cap buffer at 128 chunks)
  if (!session.audioAnalysisBuffer) session.audioAnalysisBuffer = [];
  session.audioAnalysisBuffer.push(dataB64);
  if (session.audioAnalysisBuffer.length > MAX_AUDIO_BUFFER_CHUNKS) session.audioAnalysisBuffer.shift();

  const now = Date.now();
  if (
    AUDIO_DEEPFAKE_ENABLED &&
    !session.audioAnalysisInFlight &&
    session.audioAnalysisBuffer.length >= 8 &&
    now - session.lastAudioAnalysisAt >= AUDIO_ANALYSIS_INTERVAL_MS
  ) {
    // 7.12: Only splice 8 chunks at a time
    const chunks = session.audioAnalysisBuffer.splice(0, 8);
    const combinedAudioB64 = combineAudioChunks(chunks);

    // RMS signal detection: skip silence from virtual PulseAudio sink
    const pcmBuf = Buffer.from(combinedAudioB64, "base64");
    let rmsEnergy = 0;
    for (let i = 0; i < pcmBuf.length - 1; i += 2) {
      const sample = pcmBuf.readInt16LE(i);
      rmsEnergy += sample * sample;
    }
    rmsEnergy = Math.sqrt(rmsEnergy / (pcmBuf.length / 2));

    if (rmsEnergy < RMS_SILENCE_THRESHOLD) {
      // Silence detected — skip AI analysis to avoid false "spoofed" flags
      session.audioHasSignal = false;
      log.info("audio", `Chunk skipped: RMS ${rmsEnergy.toFixed(0)} below threshold`);
      return;
    }
    session.audioHasSignal = true;
    session.audioAnalysisInFlight = true;
    session.lastAudioAnalysisAt = now;

    analyzeAudio({ sessionId: session.id, audioB64: combinedAudioB64, durationMs: 4000 })
      .then((res) => {
        session.audioAnalysisInFlight = false;
        if (res?.audio?.authenticityScore != null) {
          const effectiveAudioScore = getEffectiveAudioScore(session.id, res.audio.authenticityScore);
          session.audioAuthenticityScore = effectiveAudioScore;
          if (session.metrics) {
            session.metrics.confidenceLayers = session.metrics.confidenceLayers || {};
            session.metrics.confidenceLayers.audio = effectiveAudioScore;
          }
          // Fix 2: Recompute trust and broadcast so frontend sees audio updates
          // C5 fix: Use raw deepfake authenticityScore (not composite trustScore) to avoid double-counting
          if (session.metrics?.trustScore != null) {
            const behaviorConf = session.metrics.confidenceLayers?.behavior || 0.55;
            const videoSignal = session.metrics.deepfake?.authenticityScore
              ?? session.metrics.confidenceLayers?.video ?? 0.5;
            const audioScore = effectiveAudioScore;
            const finalTrust = 0.45 * videoSignal + 0.35 * audioScore + 0.20 * behaviorConf;
            session.metrics.trustScore = Math.max(0, Math.min(1, parseFloat(finalTrust.toFixed(4))));
          }
          session.metrics.timestamp = makeIso();
          broadcastToSession(session.id, { type: "metrics", data: session.metrics });
        }
      })
      .catch((err) => {
        session.audioAnalysisInFlight = false;
        log.error("server", `audio-analysis error: ${err.message}`);
      });

    // Whisper transcription — runs in parallel with audio deepfake analysis
    transcribeAudio({ sessionId: session.id, audioB64: combinedAudioB64, durationMs: 4000 })
      .then((res) => {
        if (res?.transcript?.text) {
          handleTranscript(session, {
            text: res.transcript.text,
            isFinal: true,
            confidence: 0.9,
            ts: res.processedAt || new Date().toISOString(),
            source: "whisper",
          });
        }
      })
      .catch(() => {});
  }
}

module.exports = { combineAudioChunks, processAudioChunk };
