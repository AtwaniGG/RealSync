const EMOTIONS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"];

/** Maximum in-memory alerts per session before trimming oldest entries. */
const MAX_SESSION_ALERTS = 200;

/** Maximum in-memory transcript lines per session. */
const MAX_TRANSCRIPT_LINES = 500;

/** Maximum base64 frame payload size (bytes). */
const MAX_FRAME_B64_SIZE = 2 * 1024 * 1024;

/** Maximum base64 audio chunk payload size (bytes). */
const MAX_AUDIO_B64_SIZE = 512 * 1024;

/** Maximum caption text length (characters). */
const MAX_CAPTION_LENGTH = 1000;

module.exports = {
  EMOTIONS,
  MAX_SESSION_ALERTS,
  MAX_TRANSCRIPT_LINES,
  MAX_FRAME_B64_SIZE,
  MAX_AUDIO_B64_SIZE,
  MAX_CAPTION_LENGTH,
};
