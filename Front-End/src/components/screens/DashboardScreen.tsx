import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../layout/Sidebar';
import { TopBar } from '../layout/TopBar';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { buildApiUrl, buildWsUrl } from '../../lib/api';

interface DashboardScreenProps {
  onNavigate: (screen: 'login' | 'dashboard' | 'sessions' | 'reports' | 'settings' | 'faq') => void;
  onSignOut?: () => void;
  profilePhoto?: string | null;
  userName?: string;
  userEmail?: string;
}

type EmotionLabel = 'Happy' | 'Neutral' | 'Angry' | 'Fear' | 'Surprise' | 'Sad';
type RiskLevel = 'low' | 'medium' | 'high';

type Metrics = {
  timestamp: string;
  source: 'simulated' | 'external';
  emotion: {
    label: EmotionLabel;
    confidence: number;
    scores: Record<EmotionLabel, number>;
  };
  identity: {
    samePerson: boolean;
    embeddingShift: number;
    riskLevel: RiskLevel;
  };
  deepfake: {
    authenticityScore: number;
    model: string;
    riskLevel: RiskLevel;
  };
  trustScore: number;
  confidenceLayers: {
    audio: number;
    video: number;
    behavior: number;
  };
};

const fallbackMetrics: Metrics = {
  timestamp: new Date().toISOString(),
  source: 'simulated',
  emotion: {
    label: 'Happy',
    confidence: 0.92,
    scores: {
      Happy: 0.92,
      Neutral: 0.04,
      Angry: 0.01,
      Fear: 0.01,
      Surprise: 0.01,
      Sad: 0.01,
    },
  },
  identity: {
    samePerson: true,
    embeddingShift: 0.12,
    riskLevel: 'low',
  },
  deepfake: {
    authenticityScore: 0.96,
    model: 'XceptionNet + EfficientNet',
    riskLevel: 'low',
  },
  trustScore: 0.98,
  confidenceLayers: {
    audio: 0.99,
    video: 0.97,
    behavior: 0.82,
  },
};

const toPercent = (value: number) => (value > 1 ? Math.round(value) : Math.round(value * 100));

const getRiskColor = (risk: RiskLevel) => {
  if (risk === 'high') return 'text-red-400';
  if (risk === 'medium') return 'text-yellow-400';
  return 'text-green-400';
};

export function DashboardScreen({ onNavigate, onSignOut, profilePhoto, userName, userEmail }: DashboardScreenProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    let isActive = true;
    let ws: WebSocket | null = null;
    let pollingInterval: number | null = null;

    const fetchMetrics = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/metrics'));
        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }
        const data: Metrics = await response.json();
        if (isActive) {
          setMetrics(data);
          setMetricsError(null);
        }
      } catch (error) {
        if (isActive) {
          setMetricsError('Backend offline');
        }
      }
    };

    const startPolling = () => {
      if (pollingInterval) return;
      fetchMetrics();
      pollingInterval = window.setInterval(fetchMetrics, 2000);
    };

    const stopPolling = () => {
      if (pollingInterval) {
        window.clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(buildWsUrl('/ws'));
      } catch (error) {
        startPolling();
        return;
      }

      ws.onopen = () => {
        if (!isActive) return;
        setWsConnected(true);
        setMetricsError(null);
        stopPolling();
      };

      ws.onmessage = (event) => {
        if (!isActive) return;
        try {
          const message = JSON.parse(event.data);
          const payload = message?.data ?? message;
          if (payload?.emotion) {
            setMetrics(payload as Metrics);
            setMetricsError(null);
          }
        } catch (err) {
          // Ignore malformed payloads
        }
      };

      ws.onclose = () => {
        if (!isActive) return;
        setWsConnected(false);
        setMetricsError('Backend offline');
        startPolling();
      };

      ws.onerror = () => {
        if (!isActive) return;
        setWsConnected(false);
        setMetricsError('Backend offline');
      };
    };

    startPolling();
    connectWebSocket();

    return () => {
      isActive = false;
      stopPolling();
      ws?.close();
    };
  }, []);

  const displayMetrics = metrics ?? fallbackMetrics;
  const trustScorePercent = toPercent(displayMetrics.trustScore);
  const trustDash = (2 * Math.PI * 88 * trustScorePercent) / 100;
  const lastUpdatedLabel = displayMetrics.timestamp
    ? new Date(displayMetrics.timestamp).toLocaleTimeString()
    : '--:--';
  const sourceLabel = displayMetrics.source === 'external' ? 'model server' : 'simulated';
  const connectionLabel = wsConnected ? 'live' : 'polling';

  const emotionScores = useMemo(() => {
    const entries = Object.entries(displayMetrics.emotion.scores) as Array<[EmotionLabel, number]>;
    return entries
      .map(([label, value]) => ({ label, value: toPercent(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }, [displayMetrics]);

  const alerts = useMemo(() => {
    const items: Array<{ type: 'error' | 'warning' | 'ok'; message: string; time: string }> = [];

    if (displayMetrics.deepfake.riskLevel !== 'low') {
      items.push({
        type: displayMetrics.deepfake.riskLevel === 'high' ? 'error' : 'warning',
        message: 'Potential visual manipulation detected.',
        time: 'just now',
      });
    }

    if (displayMetrics.identity.riskLevel !== 'low') {
      items.push({
        type: displayMetrics.identity.riskLevel === 'high' ? 'error' : 'warning',
        message: 'Face embedding drift above baseline.',
        time: 'just now',
      });
    }

    if (displayMetrics.emotion.label !== 'Neutral' && displayMetrics.emotion.confidence > 0.7) {
      items.push({
        type: 'warning',
        message: `Elevated ${displayMetrics.emotion.label.toLowerCase()} expression detected.`,
        time: 'just now',
      });
    }

    if (items.length === 0) {
      items.push({
        type: 'ok',
        message: 'All systems normal.',
        time: 'just now',
      });
    }

    return items;
  }, [displayMetrics]);

  const confidenceScores = [
    { label: 'Audio', value: toPercent(displayMetrics.confidenceLayers.audio), color: 'bg-cyan-400' },
    { label: 'Video', value: toPercent(displayMetrics.confidenceLayers.video), color: 'bg-cyan-400' },
    { label: 'Behavior', value: toPercent(displayMetrics.confidenceLayers.behavior), color: 'bg-orange-400' },
  ];

  return (
    <div className="flex h-screen bg-[#0f0f1e]">
      <Sidebar currentScreen="dashboard" onNavigate={onNavigate} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Dashboard" onSignOut={onSignOut} onNavigate={onNavigate} profilePhoto={profilePhoto} userName={userName} userEmail={userEmail} />
        
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-3 gap-6">
            {/* Live Trust Score */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-gray-400 text-sm mb-6">Live Trust Score</h3>
              
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-48 h-48">
                  {/* Circular progress */}
                  <svg className="w-48 h-48 transform -rotate-90">
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="#2a2a3e"
                      strokeWidth="12"
                      fill="none"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="url(#gradient)"
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={`${trustDash} ${2 * Math.PI * 88}`}
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-6xl text-white mb-1">{trustScorePercent}%</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-center text-gray-400 text-sm">Real-time Authenticity</p>
              <p className="text-center text-gray-500 text-xs mt-2">
                {metricsError
                  ? 'Backend offline • showing last known values'
                  : `Updated ${lastUpdatedLabel} • ${sourceLabel} • ${connectionLabel}`}
              </p>
              
              <div className="mt-4 h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                  style={{ width: `${trustScorePercent}%` }}
                ></div>
              </div>
            </div>

            {/* Meeting Summary */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-6">Meeting Summary</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Title:</span>
                  <span className="text-white">Q3 Financial Review</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Duration:</span>
                  <span className="text-white">00:42:15</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Participants:</span>
                  <span className="text-white">12</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Average Trust Score:</span>
                  <span className="text-cyan-400">96%</span>
                </div>
              </div>
            </div>

            {/* Live Alerts */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-6">Live Alerts</h3>
              
              <div className="space-y-4">
                {alerts.map((alert, index) => (
                  <div key={index} className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {alert.type === 'error' ? (
                        <AlertCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <AlertTriangle
                          className={`w-5 h-5 ${alert.type === 'ok' ? 'text-green-400' : 'text-orange-400'}`}
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm mb-1">{alert.message}</p>
                      <p className="text-gray-500 text-xs">{alert.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Facial Emotion Recognition */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-4">Facial Emotion Recognition</h3>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-gray-400 text-sm">Live Emotion</p>
                  <p className="text-3xl text-white">{displayMetrics.emotion.label}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-sm">Confidence</p>
                  <p className="text-2xl text-cyan-400">{toPercent(displayMetrics.emotion.confidence)}%</p>
                </div>
              </div>
              <div className="space-y-3">
                {emotionScores.map((score) => (
                  <div key={score.label}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{score.label}</span>
                      <span>{score.value}%</span>
                    </div>
                    <div className="h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400" style={{ width: `${score.value}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Face Presence & Identity Consistency */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-4">Identity Consistency</h3>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-gray-400 text-sm">Presence</p>
                  <p className="text-2xl text-white">{displayMetrics.identity.samePerson ? 'Same face' : 'Drift detected'}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-sm">Risk</p>
                  <p className={`text-2xl ${getRiskColor(displayMetrics.identity.riskLevel)}`}>
                    {displayMetrics.identity.riskLevel}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Embedding Shift</span>
                  <span>{toPercent(displayMetrics.identity.embeddingShift)}%</span>
                </div>
                <div className="h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${displayMetrics.identity.riskLevel === 'high' ? 'bg-red-400' : displayMetrics.identity.riskLevel === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}`}
                    style={{ width: `${toPercent(displayMetrics.identity.embeddingShift)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Deepfake / Visual Manipulation Detection */}
            <div className="bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-4">Visual Manipulation Detection</h3>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-gray-400 text-sm">Authenticity Score</p>
                  <p className="text-3xl text-white">{toPercent(displayMetrics.deepfake.authenticityScore)}%</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-sm">Risk</p>
                  <p className={`text-2xl ${getRiskColor(displayMetrics.deepfake.riskLevel)}`}>
                    {displayMetrics.deepfake.riskLevel}
                  </p>
                </div>
              </div>
              <p className="text-gray-500 text-xs mb-3">{displayMetrics.deepfake.model}</p>
              <div className="h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                <div
                  className={`h-full ${displayMetrics.deepfake.riskLevel === 'high' ? 'bg-red-400' : displayMetrics.deepfake.riskLevel === 'medium' ? 'bg-yellow-400' : 'bg-cyan-400'}`}
                  style={{ width: `${toPercent(displayMetrics.deepfake.authenticityScore)}%` }}
                ></div>
              </div>
            </div>

            {/* Confidence Layer Scores */}
            <div className="col-span-3 bg-[#1a1a2e] rounded-xl p-6 border border-gray-800">
              <h3 className="text-white text-lg mb-2">Confidence Layer Scores</h3>
              <p className="text-gray-400 text-sm mb-6">Live data from AI detection modules</p>
              
              <div className="space-y-5">
                {confidenceScores.map((score) => (
                  <div key={score.label}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-300">{score.label}</span>
                      <span className="text-white">{score.value}%</span>
                    </div>
                    <div className="h-2 bg-[#2a2a3e] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${score.color} rounded-full`}
                        style={{ width: `${score.value}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
