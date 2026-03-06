import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
  Easing,
  Audio,
  Img,
  staticFile,
  Loop,
  OffthreadVideo,
} from 'remotion';
import React from 'react';

const C = {
  bgDeep: '#0A0A14',
  bgBase: '#0F0F1E',
  bgCard: '#1A1A2E',
  cyan: '#22D3EE',
  blue: '#3B82F6',
  purple: '#A855F7',
  purpleDeep: '#6D28D9',
  green: '#4ADE80',
  red: '#F87171',
  orange: '#FB923C',
  white: '#FFFFFF',
  muted: '#9CA3AF',
  subtle: '#6B7280',
};

const font = `'Inter', 'SF Pro Display', -apple-system, sans-serif`;
const mono = `'IBM Plex Mono', 'JetBrains Mono', 'SF Mono', monospace`;

interface Dims { width: number; height: number; isPortrait: boolean; }
const DimensionContext = React.createContext<Dims>({ width: 1920, height: 1080, isPortrait: false });
const useDims = () => React.useContext(DimensionContext);

/* ═══════════════════════════════════════════
   UTILITY: Seeded random for deterministic particles
   ═══════════════════════════════════════════ */
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/* ═══════════════════════════════════════════
   EFFECT: Binary Rain (Matrix-style data streams)
   ═══════════════════════════════════════════ */
const BinaryRain: React.FC<{ opacity?: number }> = ({ opacity = 0.15 }) => {
  const frame = useCurrentFrame();
  const dims = useDims();
  const columns = dims.isPortrait ? 20 : 40;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity }}>
      {Array.from({ length: columns }).map((_, i) => {
        const x = (i / columns) * 100;
        const speed = 1.5 + seededRandom(i) * 3;
        const offset = seededRandom(i + 100) * 2000;
        const yPos = ((frame * speed + offset) % 1400) - 200;
        const chars = Array.from({ length: 12 }).map((_, j) =>
          seededRandom(i * 100 + j + Math.floor(frame * 0.1)) > 0.5 ? '1' : '0'
        ).join('\n');

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: yPos,
              fontFamily: mono,
              fontSize: 20,
              lineHeight: '26px',
              color: C.cyan,
              whiteSpace: 'pre',
              opacity: 0.3 + seededRandom(i + 50) * 0.7,
            }}
          >
            {chars}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   EFFECT: Floating Particles
   ═══════════════════════════════════════════ */
const Particles: React.FC<{ count?: number; color?: string }> = ({
  count = 60,
  color = C.cyan,
}) => {
  const frame = useCurrentFrame();
  const dims = useDims();

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {Array.from({ length: count }).map((_, i) => {
        const baseX = seededRandom(i) * dims.width;
        const baseY = seededRandom(i + 200) * dims.height;
        const size = 1 + seededRandom(i + 300) * 3;
        const speed = 0.2 + seededRandom(i + 400) * 0.8;
        const phase = seededRandom(i + 500) * Math.PI * 2;

        const x = baseX + Math.sin(frame * 0.01 * speed + phase) * 60;
        const y = baseY + Math.cos(frame * 0.008 * speed + phase) * 40;
        const op = 0.2 + Math.sin(frame * 0.02 + phase) * 0.3;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: color,
              opacity: op,
              boxShadow: `0 0 ${size * 3}px ${color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   EFFECT: Glitch Text
   ═══════════════════════════════════════════ */
const GlitchText: React.FC<{
  children: string;
  fontSize: number;
  color?: string;
  intensity?: number;
}> = ({ children, fontSize, color = C.white, intensity = 1 }) => {
  const frame = useCurrentFrame();
  const glitchActive = Math.sin(frame * 0.7) > 0.85;
  const offsetX = glitchActive ? (seededRandom(frame) - 0.5) * 8 * intensity : 0;
  const offsetY = glitchActive ? (seededRandom(frame + 1) - 0.5) * 4 * intensity : 0;
  const skew = glitchActive ? (seededRandom(frame + 2) - 0.5) * 3 * intensity : 0;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Red channel offset */}
      {glitchActive && (
        <div
          style={{
            position: 'absolute',
            fontFamily: font,
            fontSize,
            fontWeight: 800,
            color: '#ff000080',
            transform: `translate(${offsetX * 2}px, ${offsetY}px) skewX(${skew}deg)`,
            whiteSpace: 'nowrap',
          }}
        >
          {children}
        </div>
      )}
      {/* Cyan channel offset */}
      {glitchActive && (
        <div
          style={{
            position: 'absolute',
            fontFamily: font,
            fontSize,
            fontWeight: 800,
            color: `${C.cyan}60`,
            transform: `translate(${-offsetX * 1.5}px, ${-offsetY}px) skewX(${-skew}deg)`,
            whiteSpace: 'nowrap',
          }}
        >
          {children}
        </div>
      )}
      {/* Main text */}
      <div
        style={{
          position: 'relative',
          fontFamily: font,
          fontSize,
          fontWeight: 800,
          color,
          transform: `translate(${offsetX}px, 0) skewX(${skew * 0.5}deg)`,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   EFFECT: Horizontal Noise Band
   ═══════════════════════════════════════════ */
const NoiseBands: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const dims = useDims();
  const active = Math.sin(frame * 0.5) > 0.9 || Math.sin(frame * 1.3) > 0.95;
  if (!active) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
      {Array.from({ length: 3 }).map((_, i) => {
        const y = seededRandom(frame * 3 + i) * dims.height;
        const h = 2 + seededRandom(frame * 3 + i + 10) * 6 * intensity;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: y,
              left: 0,
              width: '100%',
              height: h,
              background: `${C.cyan}30`,
              opacity: 0.5 + seededRandom(frame + i) * 0.5,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   EFFECT: Flash Transition
   ═══════════════════════════════════════════ */
const FlashTransition: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - at;
  if (local < 0 || local > fps * 0.3) return null;

  const opacity = interpolate(local, [0, 2, fps * 0.3], [0, 1, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: C.white,
        opacity: opacity * 0.8,
        zIndex: 100,
      }}
    />
  );
};

/* ═══════════════════════════════════════════
   EFFECT: Face Wireframe (scanning visualization)
   ═══════════════════════════════════════════ */
const FaceWireframe: React.FC<{ scale?: number; glitch?: boolean }> = ({
  scale = 1,
  glitch = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const breathe = 1 + Math.sin(frame * 0.03) * 0.015;
  const rot = Math.sin(frame * 0.008) * 2;

  const scanY = interpolate(frame % (fps * 2.5), [0, fps * 2.5], [0, 400], {
    extrapolateRight: 'clamp',
  });
  const scanOp = interpolate(frame % (fps * 2.5), [0, fps * 0.2, fps * 2.2, fps * 2.5], [0, 0.8, 0.8, 0]);

  const gx = glitch && Math.sin(frame * 0.7) > 0.85
    ? (seededRandom(frame) - 0.5) * 8 : 0;

  // Rotating outer ring
  const ringRot = frame * 0.8;
  // Pulsing inner ring
  const innerPulse = 1 + Math.sin(frame * 0.04) * 0.03;

  // Triangulated mesh points for a more geometric, techy face
  const meshPoints: [number, number][] = [
    // Jawline
    [150, 40], [195, 55], [230, 85], [248, 130], [250, 180],
    [245, 230], [230, 270], [205, 300], [175, 320], [150, 328],
    [125, 320], [95, 300], [70, 270], [55, 230], [50, 180],
    [52, 130], [70, 85], [105, 55],
    // Inner features
    [110, 140], [140, 135], [160, 135], [190, 140], // brow line
    [105, 160], [125, 155], [140, 160], // left eye
    [160, 160], [175, 155], [195, 160], // right eye
    [150, 185], [145, 205], [155, 205], // nose
    [120, 235], [135, 245], [150, 248], [165, 245], [180, 235], // mouth
    [150, 110], // forehead center
  ];

  // Triangulation connections (index pairs for mesh lines)
  const connections: [number, number][] = [
    // Jawline
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],[16,17],[17,0],
    // Cross-connects
    [0,17],[0,35],[35,18],[35,21],[18,19],[19,20],[20,21],
    [18,22],[19,23],[19,24],[20,25],[20,26],[21,27],
    [22,23],[23,24],[25,26],[26,27],
    [24,28],[25,28],[28,29],[28,30],
    [29,31],[30,31],[31,32],[32,33],[33,34],
    [24,29],[25,30],[23,29],[26,30],
    // Outer to inner
    [1,18],[2,18],[16,17],[15,14],[3,21],[4,27],[5,27],[6,34],[7,34],
    [11,31],[12,13],[10,31],[17,18],[1,35],[0,18],[16,22],
  ];

  return (
    <div
      style={{
        position: 'relative',
        width: 300 * scale,
        height: 400 * scale,
        transform: `scale(${breathe}) rotate(${rot}deg) translateX(${gx}px)`,
      }}
    >
      {/* Outer rotating ring */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 320 * scale,
          height: 320 * scale,
          transform: `translate(-50%, -50%) rotate(${ringRot}deg)`,
          borderRadius: '50%',
          border: `1.5px solid ${C.cyan}40`,
          borderTopColor: C.cyan,
          borderBottomColor: 'transparent',
        }}
      />
      {/* Inner pulsing ring */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 280 * scale,
          height: 340 * scale,
          transform: `translate(-50%, -50%) scale(${innerPulse}) rotate(${-ringRot * 0.5}deg)`,
          borderRadius: '50%',
          border: `1px solid ${C.cyan}25`,
          borderLeftColor: `${C.blue}60`,
          borderRightColor: 'transparent',
        }}
      />
      {/* Corner brackets */}
      {[[15, 15, 'top', 'left'], [255, 15, 'top', 'right'], [15, 355, 'bottom', 'left'], [255, 355, 'bottom', 'right']].map(
        ([x, y, vEdge, hEdge], i) => (
          <div
            key={`bracket-${i}`}
            style={{
              position: 'absolute',
              left: (x as number) * scale,
              top: (y as number) * scale,
              width: 30 * scale,
              height: 30 * scale,
              [`border${(vEdge as string).charAt(0).toUpperCase() + (vEdge as string).slice(1)}`]: `3px solid ${C.cyan}80`,
              [`border${(hEdge as string).charAt(0).toUpperCase() + (hEdge as string).slice(1)}`]: `3px solid ${C.cyan}80`,
            }}
          />
        )
      )}

      <svg
        viewBox="0 0 300 400"
        width={300 * scale}
        height={400 * scale}
        fill="none"
        style={{ position: 'relative', zIndex: 1 }}
      >
        {/* Mesh connections */}
        {connections.map(([a, b], i) => {
          const pa = meshPoints[a];
          const pb = meshPoints[b];
          if (!pa || !pb) return null;
          const pulseOp = 0.12 + Math.sin(frame * 0.02 + i * 0.3) * 0.08;
          return (
            <line
              key={`c${i}`}
              x1={pa[0]} y1={pa[1]}
              x2={pb[0]} y2={pb[1]}
              stroke={C.cyan}
              strokeWidth="0.6"
              opacity={pulseOp}
            />
          );
        })}
        {/* Mesh vertices */}
        {meshPoints.map(([cx, cy], i) => {
          const pulse = 0.4 + Math.sin(frame * 0.04 + i * 0.5) * 0.4;
          const r = i < 18 ? 2 : 2.5; // Feature points slightly larger
          return (
            <React.Fragment key={`v${i}`}>
              <circle cx={cx} cy={cy} r={r} fill={C.cyan} opacity={pulse} />
              {/* Glow on feature points */}
              {i >= 18 && (
                <circle cx={cx} cy={cy} r={r * 3} fill={C.cyan} opacity={pulse * 0.15} />
              )}
            </React.Fragment>
          );
        })}
        {/* Eye highlight circles */}
        <circle cx="115" cy="158" r="18" stroke={C.cyan} strokeWidth="0.8" opacity="0.4" />
        <circle cx="185" cy="158" r="18" stroke={C.cyan} strokeWidth="0.8" opacity="0.4" />
        {/* Iris dots */}
        <circle cx="115" cy="158" r="4" fill={C.cyan} opacity={0.7 + Math.sin(frame * 0.06) * 0.3} />
        <circle cx="185" cy="158" r="4" fill={C.cyan} opacity={0.7 + Math.sin(frame * 0.06 + 1) * 0.3} />
      </svg>

      {/* Scan line */}
      <div
        style={{
          position: 'absolute',
          top: scanY * scale,
          left: '5%',
          width: '90%',
          height: 2,
          background: `linear-gradient(90deg, transparent, ${C.cyan}90, ${C.cyan}, ${C.cyan}90, transparent)`,
          boxShadow: `0 0 15px ${C.cyan}60, 0 0 30px ${C.cyan}30`,
          opacity: scanOp,
          zIndex: 2,
        }}
      />

      {/* Data readout labels */}
      <div
        style={{
          position: 'absolute',
          top: 30 * scale,
          right: -60 * scale,
          fontFamily: mono,
          fontSize: 13 * scale,
          color: `${C.cyan}90`,
          letterSpacing: '1px',
          lineHeight: 1.8,
          textAlign: 'right',
        }}
      >
        <div>FACE_ID: 001</div>
        <div style={{ opacity: 0.5 + Math.sin(frame * 0.05) * 0.5 }}>SCAN: ACTIVE</div>
        <div>MESH: 36pt</div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   EFFECT: Face Dissolve — Real photo shatters into pixel particles
   ═══════════════════════════════════════════ */
const FaceDissolve: React.FC<{
  scale?: number;
  dissolveStart?: number;
  dissolveDuration?: number;
}> = ({ scale = 1, dissolveStart = 30, dissolveDuration = 45 }) => {
  const frame = useCurrentFrame();
  const W = 300;
  const H = 400;
  const COLS = 20;
  const ROWS = 25;
  const CW = W / COLS;
  const CH = H / ROWS;

  const progress = interpolate(frame, [dissolveStart, dissolveStart + dissolveDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scanY = interpolate(frame, [0, dissolveStart], [0, H], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (progress === 0) {
    return (
      <div style={{ width: W * scale, height: H * scale, position: 'relative', borderRadius: 12 * scale, overflow: 'hidden' }}>
        <Img src={staticFile('face-portrait.png')} style={{ width: W * scale, height: H * scale, objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', top: scanY * scale, left: 0, width: '100%', height: 2,
          background: `linear-gradient(90deg, transparent, ${C.cyan}90, ${C.cyan}, ${C.cyan}90, transparent)`,
          boxShadow: `0 0 15px ${C.cyan}60, 0 0 30px ${C.cyan}30`,
        }} />
      </div>
    );
  }

  return (
    <div style={{ width: W * scale, height: H * scale, position: 'relative' }}>
      {Array.from({ length: COLS * ROWS }).map((_, idx) => {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const stagger = seededRandom(idx * 7 + 13) * 0.6;
        const cellP = interpolate(progress, [stagger, stagger + 0.4], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        if (cellP >= 1) return null;
        const driftX = (seededRandom(idx * 3 + 1) - 0.5) * 200 * cellP;
        const driftY = (seededRandom(idx * 3 + 2) - 0.5) * 200 * cellP - 50 * cellP;
        const rot = (seededRandom(idx * 3 + 3) - 0.5) * 360 * cellP;
        return (
          <div key={idx} style={{
            position: 'absolute',
            left: col * CW * scale, top: row * CH * scale,
            width: CW * scale, height: CH * scale,
            overflow: 'hidden',
            opacity: 1 - cellP,
            transform: `translate(${driftX * scale}px, ${driftY * scale}px) rotate(${rot}deg) scale(${1 - cellP * 0.5})`,
          }}>
            <Img src={staticFile('face-portrait.png')} style={{
              position: 'absolute', width: W * scale, height: H * scale, objectFit: 'cover',
              left: -(col * CW * scale), top: -(row * CH * scale),
            }} />
          </div>
        );
      })}
    </div>
  );
};

/* ═══════════════════════════════════════════
   SCENE 1: THE HOOK (0–3s) — "Is this person real?"
   Jarring, immediate, grabs attention
   ═══════════════════════════════════════════ */
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dims = useDims();

  // Zoom in effect
  const zoom = interpolate(frame, [0, fps * 3], [1.1, 1.3], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const questionOp = interpolate(frame, [fps * 1.5, fps * 2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: C.bgDeep }}>
      {/* Background: B-roll of someone on a video call */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <OffthreadVideo
          src={staticFile('broll-fraud.mp4')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${zoom})`,
          }}
          volume={0}
        />
        {/* Dark overlay for cinematic feel + text readability */}
        <AbsoluteFill style={{ background: 'rgba(10, 10, 20, 0.5)' }} />
      </AbsoluteFill>

      {/* Question text */}
      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: dims.isPortrait ? 450 : 160,
        }}
      >
        <div style={{ opacity: questionOp }}>
          <GlitchText fontSize={90} color={C.white} intensity={2}>
            Is this person real?
          </GlitchText>
        </div>
      </AbsoluteFill>

      <NoiseBands intensity={2} />
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   SCENE 2: THE THREAT (3–8s) — Rapid-fire threat montage
   ═══════════════════════════════════════════ */
const ThreatMontage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dims = useDims();

  const headlines = [
    { text: 'AI VOICE CLONE SCAMS SURGE 500%', sub: 'Families targeted', color: C.orange },
    { text: 'CEO DEEPFAKED ON ZOOM CALL', sub: '$25B wire fraud', color: C.red },
    { text: 'ELECTION DEEPFAKES GO VIRAL', sub: '96% of people fooled', color: C.red },
    { text: 'IDENTITY THEFT VIA VIDEO CALLS', sub: 'Banks compromised', color: C.orange },
  ];

  // Each headline gets ~1.2s
  // 4 headlines across ~10s of scene time
  const headlineDuration = fps * 2.5;

  return (
    <AbsoluteFill style={{ background: C.bgDeep }}>
      <BinaryRain opacity={0.05} />

      {headlines.map((hl, i) => {
        const start = i * headlineDuration;
        const local = frame - start;
        if (local < 0 || local > headlineDuration) return null;

        // Slam in from scale 3 → 1
        const scale = interpolate(local, [0, 6], [3, 1], {
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.exp),
        });
        const opacity = interpolate(
          local,
          [0, 4, headlineDuration - 4, headlineDuration],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        const subOp = interpolate(local, [8, 14], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <AbsoluteFill
            key={i}
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              opacity,
            }}
          >
            <div style={{ textAlign: 'center', transform: `scale(${scale})` }}>
              <div
                style={{
                  fontFamily: font,
                  fontSize: 80,
                  fontWeight: 800,
                  color: hl.color,
                  letterSpacing: '-1px',
                  textShadow: `0 0 40px ${hl.color}40`,
                }}
              >
                {hl.text}
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: dims.isPortrait ? 620 : 380,
                fontFamily: mono,
                fontSize: 32,
                color: C.muted,
                opacity: subOp,
                letterSpacing: '4px',
                textTransform: 'uppercase',
              }}
            >
              {hl.sub}
            </div>
          </AbsoluteFill>
        );
      })}

      <NoiseBands intensity={3} />
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   SCENE 3: LOGO EXPLOSION (8–12s) — "RealSync" smashes in
   ═══════════════════════════════════════════ */
const LogoExplosion: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dims = useDims();

  // Dramatic zoom from huge to normal
  const logoScale = interpolate(frame, [0, 8], [5, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.exp),
  });

  const logoOp = interpolate(frame, [0, 3], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Tagline types in
  const tagline = 'TRUST WHAT YOU SEE';
  const charsVisible = Math.floor(
    interpolate(frame, [fps * 1, fps * 2.5], [0, tagline.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  // Underline wipe
  const lineWidth = interpolate(frame, [fps * 2.5, fps * 3.2], [0, 500], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Breathing glow
  const glowIntensity = 20 + Math.sin(frame * 0.05) * 10;

  // Particle burst on impact
  const burstProgress = interpolate(frame, [0, fps * 1.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: C.bgDeep }}>
      <Particles count={80} color={C.cyan} />

      {/* Burst particles */}
      {frame < fps * 1.5 &&
        Array.from({ length: 20 }).map((_, i) => {
          const angle = (i / 20) * Math.PI * 2;
          const dist = burstProgress * 600;
          const x = dims.width / 2 + Math.cos(angle) * dist;
          const y = dims.height / 2 + Math.sin(angle) * dist;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: C.cyan,
                opacity: 1 - burstProgress,
                boxShadow: `0 0 10px ${C.cyan}`,
              }}
            />
          );
        })}

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        {/* Logo icon + text */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${logoScale})`, opacity: logoOp }}>
          <Img
            src={staticFile('realsync-logo.png')}
            style={{
              width: 500,
              height: 'auto',
              marginBottom: 24,
              filter: `drop-shadow(0 0 ${glowIntensity}px ${C.cyan}60)`,
            }}
          />
          <div
            style={{
              fontFamily: font,
              fontSize: 160,
              fontWeight: 800,
              letterSpacing: '-5px',
              background: `linear-gradient(135deg, ${C.cyan}, ${C.blue}, ${C.purple})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 0 ${glowIntensity}px ${C.cyan}40)`,
            }}
          >
            RealSync
          </div>
        </div>

        {/* Tagline - typed out */}
        <div
          style={{
            marginTop: 30,
            fontFamily: mono,
            fontSize: 36,
            letterSpacing: '10px',
            color: C.muted,
            height: 44,
          }}
        >
          {tagline.slice(0, charsVisible)}
          {charsVisible < tagline.length && (
            <span
              style={{
                opacity: Math.sin(frame * 0.15) > 0 ? 1 : 0,
                color: C.cyan,
              }}
            >
              _
            </span>
          )}
        </div>

        {/* Underline */}
        <div
          style={{
            width: lineWidth,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`,
            marginTop: 28,
            boxShadow: `0 0 15px ${C.cyan}60`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   SCENE 4: AI SCANNING (12–19s) — Show the AI at work
   Three analysis modes revealed with scanning effects
   ═══════════════════════════════════════════ */
const AIScanning: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dims = useDims();

  const modes = [
    {
      label: 'DEEPFAKE DETECTION',
      detail: 'Frame-by-frame visual analysis',
      color: C.red,
      icon: '🛡️',
    },
    {
      label: 'EMOTION ANALYSIS',
      detail: 'Face + speech sentiment fusion',
      color: C.purple,
      icon: '🎭',
    },
    {
      label: 'AUDIO VERIFICATION',
      detail: 'Real-time voice clone detection',
      color: C.cyan,
      icon: '🎙️',
    },
  ];

  // 3 modes across ~13s of scene time
  const modeDuration = fps * 4.3;

  return (
    <AbsoluteFill style={{ background: C.bgDeep }}>
      <BinaryRain opacity={0.04} />

      {/* Persistent face — left in landscape, top-center in portrait */}
      <div
        style={{
          position: 'absolute',
          ...(dims.isPortrait
            ? { left: '50%', top: 120, transform: 'translateX(-50%)' }
            : { left: 120, top: '50%', transform: 'translateY(-50%)' }),
        }}
      >
        <FaceWireframe scale={dims.isPortrait ? 0.85 : 1.1} />
      </div>

      {/* Analysis panels on right */}
      {modes.map((mode, i) => {
        const start = i * modeDuration;
        const local = frame - start;
        if (local < -5 || local > modeDuration + 5) return null;

        const slideX = interpolate(local, [0, 12], [200, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.exp),
        });
        const opacity = interpolate(
          local,
          [0, 8, modeDuration - 8, modeDuration],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );

        // Progress bar animation
        const barWidth = interpolate(local, [15, modeDuration - 10], [0, 100], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        // Confidence counter
        const confidence = Math.floor(
          interpolate(local, [15, modeDuration - 10], [0, 94 + i * 2], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        );

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              opacity,
              width: dims.isPortrait ? 480 : 650,
              ...(dims.isPortrait
                ? { left: '50%', top: '55%', transform: `translateX(-50%) translateY(${slideX}px)` }
                : { right: 140, top: '50%', transform: `translateY(-50%) translateX(${slideX}px)` }),
            }}
          >
            {/* Mode label */}
            <div
              style={{
                fontFamily: mono,
                fontSize: 20,
                color: mode.color,
                letterSpacing: '5px',
                marginBottom: 12,
                opacity: 0.8,
              }}
            >
              ▸ ANALYZING
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <span style={{ fontSize: 56 }}>{mode.icon}</span>
              <div
                style={{
                  fontFamily: font,
                  fontSize: 56,
                  fontWeight: 800,
                  color: mode.color,
                  textShadow: `0 0 30px ${mode.color}30`,
                }}
              >
                {mode.label}
              </div>
            </div>
            <div
              style={{
                fontFamily: font,
                fontSize: 28,
                color: C.subtle,
                marginBottom: 24,
              }}
            >
              {mode.detail}
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: 10,
                background: `${C.bgCard}`,
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${mode.color}, ${mode.color}aa)`,
                  borderRadius: 3,
                  boxShadow: `0 0 10px ${mode.color}60`,
                }}
              />
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 24,
                color: mode.color,
                marginTop: 10,
                textAlign: 'right',
              }}
            >
              Confidence: {confidence}%
            </div>
          </div>
        );
      })}

      {/* Connecting lines from face to panel */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox={`0 0 ${dims.width} ${dims.height}`}
      >
        {[0, 1, 2].map((i) => {
          const local = frame - i * modeDuration;
          const op = interpolate(local, [5, 15, modeDuration - 8, modeDuration], [0, 0.3, 0.3, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const dashOffset = frame * 2;
          return dims.isPortrait ? (
            <line
              key={i}
              x1="540"
              y1="580"
              x2={500 + i * 40}
              y2="1050"
              stroke={modes[i].color}
              strokeWidth="1"
              strokeDasharray="8 8"
              strokeDashoffset={dashOffset}
              opacity={op}
            />
          ) : (
            <line
              key={i}
              x1="470"
              y1="540"
              x2="1080"
              y2={440 + i * 40}
              stroke={modes[i].color}
              strokeWidth="1"
              strokeDasharray="8 8"
              strokeDashoffset={dashOffset}
              opacity={op}
            />
          );
        })}
      </svg>

      <NoiseBands />
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   SCENE 5: LIVE DASHBOARD — Real screenshot with cinematic framing
   ═══════════════════════════════════════════ */
const LiveDashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dims = useDims();

  // Spring scale-in
  const containerScale = spring({ frame, fps, config: { damping: 15, stiffness: 50 } });
  const containerOp = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Slow zoom drift
  const zoom = interpolate(frame, [0, fps * 8], [1, 1.06], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // 3 frames: idle → active → alert
  // Scene is 240 frames (8s). Transition: idle 0–2.5s, active 2.5–5s, alert 5–8s
  const idleOp = interpolate(frame, [0, fps * 2, fps * 2.5], [1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const activeOp = interpolate(frame, [fps * 2, fps * 2.5, fps * 4.5, fps * 5], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const alertOp = interpolate(frame, [fps * 4.5, fps * 5], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const screenshots = [
    { src: 'dash-idle.png', opacity: idleOp },
    { src: 'dash-active.png', opacity: activeOp },
    { src: 'dash-alert.png', opacity: alertOp },
  ];

  return (
    <AbsoluteFill style={{ background: C.bgDeep }}>
      <Particles count={20} color={C.cyan} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        {/* Browser chrome wrapper */}
        <div
          style={{
            transform: `scale(${containerScale * (dims.isPortrait ? 0.92 : 0.82)})`,
            opacity: containerOp,
            width: dims.isPortrait ? 880 : 1600,
            marginRight: dims.isPortrait ? 60 : 0,
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: `0 0 80px ${C.cyan}10, 0 40px 80px rgba(0,0,0,0.6)`,
            border: `1px solid ${C.cyan}15`,
          }}
        >
          {/* Browser top bar */}
          <div
            style={{
              height: 48,
              background: '#1e1e2e',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: 8,
              borderBottom: '1px solid #2a2a3e',
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#eab308' }} />
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#22c55e' }} />
            </div>
            <div
              style={{
                flex: 1,
                marginLeft: 12,
                background: '#0f0f1e',
                borderRadius: 6,
                padding: '4px 14px',
                fontFamily: mono,
                fontSize: 15,
                color: C.muted,
              }}
            >
              real-sync.app/dashboard
            </div>
          </div>

          {/* Animated dashboard frames — crossfade between states */}
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            {screenshots.map((shot, i) => (
              <Img
                key={i}
                src={staticFile(shot.src)}
                style={{
                  width: dims.isPortrait ? 880 : 1600,
                  display: 'block',
                  position: i === 0 ? 'relative' : 'absolute',
                  top: 0,
                  left: 0,
                  opacity: shot.opacity,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                }}
              />
            ))}
          </div>
        </div>
      </AbsoluteFill>

      <NoiseBands />
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   SCENE 6: CLOSING (24–30s) — Bold CTA
   ═══════════════════════════════════════════ */
const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dims = useDims();

  // Logo breathes
  const breathe = 1 + Math.sin(frame * 0.04) * 0.015;
  const logoOp = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const tagOp = interpolate(frame, [fps * 1, fps * 1.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const urlOp = interpolate(frame, [fps * 2, fps * 2.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Expanding rings
  const ringCount = 3;

  return (
    <AbsoluteFill style={{ background: C.bgDeep }}>
      <Particles count={50} color={C.cyan} />
      <Particles count={30} color={C.purple} />

      {/* Rings */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        {Array.from({ length: ringCount }).map((_, i) => {
          const size = 200 + i * 120;
          const rotation = frame * (0.3 - i * 0.1);
          const op = 0.1 - i * 0.025;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: '50%',
                border: `1px solid ${C.cyan}`,
                opacity: op,
                transform: `rotate(${rotation}deg) scale(${breathe})`,
              }}
            />
          );
        })}
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: dims.isPortrait ? 300 : 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              opacity: logoOp,
              transform: `scale(${breathe})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <Img
              src={staticFile('realsync-logo.png')}
              style={{
                width: 470,
                height: 'auto',
                marginBottom: 20,
                filter: `drop-shadow(0 0 20px ${C.cyan}50)`,
              }}
            />
            <div
              style={{
                fontFamily: font,
                fontSize: 150,
                fontWeight: 800,
                letterSpacing: '-5px',
                background: `linear-gradient(135deg, ${C.cyan}, ${C.blue}, ${C.purple})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: `drop-shadow(0 0 30px ${C.cyan}30)`,
              }}
            >
              RealSync
            </div>
          </div>

          <div
            style={{
              opacity: tagOp,
              fontFamily: font,
              fontSize: 46,
              fontWeight: 600,
              color: C.white,
              marginTop: 16,
            }}
          >
            Real-Time Meeting Authenticity
          </div>

          <div
            style={{
              opacity: urlOp,
              marginTop: 40,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '18px 44px',
              borderRadius: 50,
              background: `linear-gradient(135deg, ${C.cyan}20, ${C.blue}20)`,
              border: `1px solid ${C.cyan}40`,
            }}
          >
            <div
              style={{
                fontFamily: mono,
                fontSize: 32,
                color: C.cyan,
                letterSpacing: '4px',
              }}
            >
              real-sync.app
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ═══════════════════════════════════════════
   EFFECT: Fade to Black
   ═══════════════════════════════════════════ */
const FadeToBlack: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 60], [0, 1], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{ background: C.bgDeep, opacity, zIndex: 200 }}
    />
  );
};

/* ═══════════════════════════════════════════
   MAIN COMPOSITION — 51s @ 30fps = 1530 frames

   Timeline (synced to "Brain Implant" cyberpunk track):
   Scene 1 Hook:      0–5s      (0–149)     VO: 3.0s   Music: eerie build
   Scene 2 Threat:    5–15s     (150–449)    VO: 9.9s   Music: beat drops
   Scene 3 Logo:      15–22s    (450–659)    VO: 3.6s   Music: hit + drive
   Scene 4 Scanning:  22–36s    (660–1079)   VO: 12.6s  Music: peak energy
   Scene 5 Dashboard: 36–44s    (1080–1319)  VO: 6.8s   Music: sustained
   Scene 6 Closing:   44–51s    (1320–1529)  VO: 6.6s   Music: fadeout
   ═══════════════════════════════════════════ */
const FontLoader: React.FC = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;700&display=swap');
  `}</style>
);

/* ═══════════════════════════════════════════
   DYNAMIC MUSIC DUCKING — lower music during VO, swell in gaps
   ═══════════════════════════════════════════ */
const VO_RANGES: [number, number][] = [
  [15, 105],     // scene1 hook (3.0s)
  [160, 465],    // scene2 threat (10.2s)
  [460, 539],    // scene3 logo (2.6s)
  [670, 1095],   // scene4 scanning (14.2s)
  [1090, 1289],  // scene5 dashboard (6.6s)
  [1330, 1480],  // scene6 closing (5.0s)
];

function getMusicVolume(frame: number): number {
  const FULL = 0.45;
  const DUCKED = 0.12;
  const RAMP = 10;

  for (const [start, end] of VO_RANGES) {
    if (frame >= start && frame <= end) return DUCKED;
    if (frame >= start - RAMP && frame < start) {
      return FULL - ((frame - (start - RAMP)) / RAMP) * (FULL - DUCKED);
    }
    if (frame > end && frame <= end + RAMP) {
      return DUCKED + ((frame - end) / RAMP) * (FULL - DUCKED);
    }
  }
  return FULL;
}

/* ═══════════════════════════════════════════
   SCENE LAYOUT — synced to "Brain Implant" cyberpunk track (48.6s)

   Music energy map → scene alignment:
   0–5s   Eerie build (-22dB)         → Hook
   5s     FIRST BEAT DROP              → Flash → Threat starts
   10s    SECOND WAVE                  → Flash mid-Threat
   15s    HIT                          → Flash → Logo explosion
   22s    BIG ESCALATION (-10dB)       → Flash → AI Scanning
   27–35s PEAK ENERGY                  → Scanning modes cycle
   36s    SUSTAINED HIGH               → Flash → Dashboard
   44s    TAPER begins                 → Flash → Closing
   45–48s FADEOUT to silence           → Voice lingers alone
   ═══════════════════════════════════════════ */
const SceneLayout: React.FC = () => {
  return (
    <>
      <FontLoader />
      {/* ── Background Music (full track, no loop) ── */}
      <Audio src={staticFile('vo/bg-music.mp3')} volume={getMusicVolume} />

      {/* ── Voiceover Tracks (synced to new scene timing) ── */}
      <Sequence from={15}>
        <Audio src={staticFile('vo/scene1-hook.mp3')} volume={1} />
      </Sequence>
      <Sequence from={160}>
        <Audio src={staticFile('vo/scene2-threat.mp3')} volume={1} />
      </Sequence>
      <Sequence from={460}>
        <Audio src={staticFile('vo/scene3-logo.mp3')} volume={1} />
      </Sequence>
      <Sequence from={490} durationInFrames={60}>
        <Audio src={staticFile('vo/sfx-typing.mp3')} volume={0.35} />
      </Sequence>
      <Sequence from={670}>
        <Audio src={staticFile('vo/scene4-scanning.mp3')} volume={1} />
      </Sequence>
      <Sequence from={1090}>
        <Audio src={staticFile('vo/scene5-dashboard.mp3')} volume={1} />
      </Sequence>
      <Sequence from={1330}>
        <Audio src={staticFile('vo/scene6-closing.mp3')} volume={1} />
      </Sequence>

      {/* ── Visual Scenes (synced to music beats) ── */}

      {/* 0–5s: Hook — eerie build */}
      <Sequence from={0} durationInFrames={150}>
        <Hook />
      </Sequence>
      <FlashTransition at={148} />

      {/* 5–15s: Threat montage — beat drops at 5s and 10s */}
      <Sequence from={150} durationInFrames={300}>
        <ThreatMontage />
      </Sequence>
      <FlashTransition at={298} />
      <FlashTransition at={448} />

      {/* 15–22s: Logo explosion — 15s hit + drive to big drop */}
      <Sequence from={450} durationInFrames={210}>
        <LogoExplosion />
      </Sequence>
      <FlashTransition at={658} />

      {/* 22–36s: AI scanning — BIG escalation + peak energy */}
      <Sequence from={660} durationInFrames={420}>
        <AIScanning />
      </Sequence>
      <FlashTransition at={808} />
      <FlashTransition at={1078} />

      {/* 36–44s: Live dashboard — sustained energy */}
      <Sequence from={1080} durationInFrames={240}>
        <LiveDashboard />
      </Sequence>
      <FlashTransition at={1318} />

      {/* 44–51s: Closing — music taper, voice lingers in silence */}
      <Sequence from={1320} durationInFrames={210}>
        <Closing />
      </Sequence>

      {/* Fade to black over last 2s */}
      <Sequence from={1470} durationInFrames={60}>
        <FadeToBlack />
      </Sequence>
    </>
  );
};

export const RealSyncIntro: React.FC = () => (
  <DimensionContext.Provider value={{ width: 1920, height: 1080, isPortrait: false }}>
    <AbsoluteFill style={{ background: C.bgDeep }}>
      <SceneLayout />
    </AbsoluteFill>
  </DimensionContext.Provider>
);

export const RealSyncReel: React.FC = () => (
  <DimensionContext.Provider value={{ width: 1080, height: 1920, isPortrait: true }}>
    <AbsoluteFill style={{ background: C.bgDeep }}>
      <SceneLayout />
    </AbsoluteFill>
  </DimensionContext.Provider>
);
