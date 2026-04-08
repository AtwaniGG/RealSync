import React from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Shield, AlertTriangle, Users, Zap, Eye, Mic, Brain, AlertCircle, Info } from 'lucide-react'
import BentoCard from '../components/ui/BentoCard'
import TrustGauge from '../components/ui/TrustGauge'
import $ from '../lib/tokens'
import { EASE, LABEL_STYLE, MONO_STYLE, trustColor } from '../lib/tokens'
import { LIVE_ALERTS, TIMELINE_DATA } from '../lib/mockData'
import type { AlertSeverity } from '../lib/mockData'

const LABEL = LABEL_STYLE

const SEVERITY_STYLE: Record<AlertSeverity, { color: string; bg: string; icon: typeof AlertCircle }> = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', icon: AlertCircle },
  high: { color: '#F97316', bg: 'rgba(249,115,22,0.08)', icon: AlertTriangle },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', icon: AlertTriangle },
  low: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', icon: Info },
}

const STAT_CARDS = [
  { icon: Shield, label: 'Trust Score', val: '98%', sub: 'All signals authentic', accent: $.cyan },
  { icon: AlertTriangle, label: 'Alerts', val: '4', sub: '2 critical, 1 high', accent: $.red },
  { icon: Users, label: 'Participants', val: '3', sub: '3 faces tracked', accent: $.blue },
  { icon: Zap, label: 'Latency', val: '23ms', sub: 'Avg model response', accent: $.violet },
]

const SIGNAL_BARS = [
  { label: 'Audio', pct: 87, color: $.cyan, delay: 0.7 },
  { label: 'Video', pct: 97, color: $.blue, delay: 0.8 },
  { label: 'Behavior', pct: 82, color: $.orange, delay: 0.9 },
]

const DETECTION_PANELS = [
  { icon: Eye, label: 'Visual', score: 96, risk: 'LOW', color: $.cyan, delay: 0.3 },
  { icon: Mic, label: 'Audio', score: 87, risk: 'LOW', color: $.blue, delay: 0.4 },
  { icon: Brain, label: 'Emotion', score: 92, risk: 'LOW', color: $.violet, delay: 0.5 },
]

function SignalBar({ label, pct, color, delay }: { label: string; pct: number; color: string; delay: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: $.t3, width: 56, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: $.bg2, borderRadius: 2, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', borderRadius: 2, background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay, ease: EASE }}
        />
      </div>
      <span style={{ fontSize: 11, ...MONO_STYLE, color: $.t2, width: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function DetectionPanel({ icon: Icon, label, score, risk, color, delay }: typeof DETECTION_PANELS[0]) {
  return (
    <BentoCard delay={delay}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={14} color={color} />
          </div>
          <span style={{ fontSize: 12, color: $.t2, fontWeight: 500 }}>{label}</span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 20,
          background: 'rgba(16,185,129,0.1)', color: $.green,
        }}>
          {risk}
        </span>
      </div>

      <div style={{
        fontSize: 28, fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 300, color: $.t1,
        fontFeatureSettings: "'tnum' 1",
        display: 'block', marginBottom: 10,
      }}>
        {score}%
      </div>

      <div style={{ height: 3, background: $.bg2, borderRadius: 2, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${color}, ${$.blue})` }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.9, delay: delay + 0.2, ease: EASE }}
        />
      </div>
    </BentoCard>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: $.bg2, border: `1px solid ${$.b2}`,
      borderRadius: 8, padding: '8px 12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: 10, color: $.t3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, ...MONO_STYLE, color: $.cyan, fontWeight: 600 }}>{payload[0].value}%</div>
    </div>
  )
}

export default function Dashboard() {
  const isMobile = window.innerWidth <= 768

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Stat cards 2×2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {STAT_CARDS.map((card, i) => (
            <BentoCard key={card.label} delay={0.05 + i * 0.05}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.accent}, transparent)` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <card.icon size={11} color={card.accent} />
                <span style={LABEL}>{card.label}</span>
              </div>
              <div style={{ fontSize: 20, fontFamily: 'JetBrains Mono, monospace', color: $.t1, fontWeight: 400, fontFeatureSettings: "'tnum' 1", marginBottom: 3 }}>{card.val}</div>
              <div style={{ fontSize: 10, color: card.accent }}>{card.sub}</div>
            </BentoCard>
          ))}
        </div>

        {/* Trust gauge */}
        <BentoCard delay={0.2}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={LABEL}>Live Trust Score</span>
            <span style={{ fontSize: 9, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>simulated</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <TrustGauge pct={98} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SIGNAL_BARS.map((b) => <SignalBar key={b.label} {...b} />)}
          </div>
        </BentoCard>

        {/* Detection panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DETECTION_PANELS.map((p) => <DetectionPanel key={p.label} {...p} />)}
        </div>

        {/* Alerts */}
        <AlertFeed />

        {/* Timeline */}
        <TimelineChart height={90} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} interval={8} />
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridTemplateRows: 'auto auto 1fr',
      gap: 12, alignContent: 'start', height: '100%',
    }}>
      {/* Stat cards — row 1 */}
      {STAT_CARDS.map((card, i) => (
        <BentoCard key={card.label} span={3} delay={0.05 + i * 0.05}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.accent}, transparent)` }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <card.icon size={13} color={card.accent} />
            <span style={LABEL}>{card.label}</span>
          </div>
          <div style={{ fontSize: 22, fontFamily: 'JetBrains Mono, monospace', color: $.t1, fontWeight: 400, fontFeatureSettings: "'tnum' 1", marginBottom: 4 }}>{card.val}</div>
          <div style={{ fontSize: 11, color: card.accent }}>{card.sub}</div>
        </BentoCard>
      ))}

      {/* Trust gauge — spans rows 2-3 */}
      <BentoCard span={5} rowSpan={2} delay={0.2}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={LABEL}>Live Trust Score</span>
          <span style={{ fontSize: 9, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>simulated</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <TrustGauge pct={98} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SIGNAL_BARS.map((b) => <SignalBar key={b.label} {...b} />)}
        </div>
      </BentoCard>

      {/* Detection panels column */}
      <div style={{ gridColumn: 'span 3', gridRow: 'span 2', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {DETECTION_PANELS.map((p) => <DetectionPanel key={p.label} {...p} />)}
      </div>

      {/* Alert feed */}
      <BentoCard span={4} rowSpan={2} delay={0.25} style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={LABEL}>Live Alerts</span>
          <span style={{ fontSize: 10, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>4</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          <AlertFeedItems />
        </div>
      </BentoCard>

      {/* Timeline */}
      <BentoCard span={12} delay={0.5} style={{ padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={LABEL}>Trust Score Timeline</span>
          <span style={{ fontSize: 10, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>30 min session</span>
        </div>
        <TimelineChart height={120} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} interval={4} />
      </BentoCard>
    </div>
  )
}

function AlertFeed() {
  return (
    <BentoCard delay={0.25} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={LABEL_STYLE}>Live Alerts</span>
        <span style={{ fontSize: 10, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>4</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <AlertFeedItems />
      </div>
    </BentoCard>
  )
}

function AlertFeedItems() {
  return (
    <>
      {LIVE_ALERTS.map((alert, i) => {
        const sev = SEVERITY_STYLE[alert.sev]
        const Icon = sev.icon
        return (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.4 + i * 0.08 }}
            style={{
              borderLeft: `2px solid ${sev.color}`,
              background: sev.bg,
              borderRadius: '0 8px 8px 0',
              padding: '8px 10px',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon size={13} color={sev.color} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: sev.color, textTransform: 'uppercase' }}>{alert.cat}</span>
                  <span style={{ fontSize: 9, color: $.t4 }}>{alert.time}</span>
                </div>
                <p style={{ fontSize: 11, color: $.t2, lineHeight: 1.4, margin: 0 }}>{alert.msg}</p>
              </div>
            </div>
          </motion.div>
        )
      })}
    </>
  )
}

function TimelineChart({ height, margin, interval }: { height: number; margin: object; interval: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={TIMELINE_DATA} margin={margin as any}>
          <defs>
            <linearGradient id="timeline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={$.cyan} stopOpacity={0.2} />
              <stop offset="100%" stopColor={$.cyan} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: $.t4 }} axisLine={false} tickLine={false} interval={interval} />
          <YAxis domain={[80, 100]} tick={{ fontSize: 10, fill: $.t4 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: $.b2 }} />
          <Area
            type="monotone" dataKey="score"
            stroke={$.cyan} strokeWidth={2}
            fill="url(#timeline-fill)"
            dot={false}
            activeDot={{ r: 4, fill: $.cyan, stroke: $.bg0, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
