# WebSocket Real-Time Communication Guide

## Overview

RealSync uses WebSocket (Socket.IO) for real-time, bidirectional communication between the frontend and backend. This enables live detection results, alerts, and analytics streaming during Zoom meetings.

## Architecture

### Connection Flow

```
┌─────────────┐
│  Frontend   │
│  (React)    │
└──────┬──────┘
       │ WebSocket
       │ Connection
       ▼
┌─────────────────────────────────┐
│  Socket.IO Server               │
│  (Node.js/Express)              │
├─────────────────────────────────┤
│ Meeting Room 1                  │
│ ├─ Client 1                     │
│ ├─ Client 2                     │
│ └─ Client 3                     │
├─────────────────────────────────┤
│ Meeting Room 2                  │
│ ├─ Client 4                     │
│ └─ Client 5                     │
└─────────────────────────────────┘
```

## Connection Setup

### Client-Side (Frontend)

```javascript
import io from 'socket.io-client';

// Connect to backend
const socket = io('http://localhost:3001', {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

// Handle connection
socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

// Handle disconnection
socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

### Server-Side (Backend)

```javascript
// Automatically handled by websocket.service.js
// Socket.IO server initialized in server.js:
const websocketService = require('./src/services/websocket.service');
websocketService.initialize(server);
```

## Event Types

### 1. Meeting Room Management

#### Join Meeting

**Emit from Client:**

```javascript
socket.emit('join-meeting', {
  meetingId: '123456789',
  userId: 'user123'  // Optional
});
```

**Listen on Client:**

```javascript
socket.on('meeting-joined', (data) => {
  console.log('Joined meeting:', data.meetingId);
  console.log('Participants:', data.participants);
  // Update UI with meeting info
});
```

#### Leave Meeting

**Emit from Client:**

```javascript
socket.emit('leave-meeting', {
  meetingId: '123456789'
});
```

**Listen on Client:**

```javascript
socket.on('meeting-left', (data) => {
  console.log('Left meeting:', data.meetingId);
  // Clean up UI
});
```

### 2. Detection Results

#### Real-Time Detection Updates

**Server broadcasts to meeting room:**

```javascript
// From backend (detection engine)
io.to('meeting-123456789').emit('detection-update', {
  meetingId: '123456789',
  participantId: 'participant1',
  results: {
    audioAnalysis: {
      voiceCloneScore: 0.85,
      confidence: 0.92,
      features: ['pitch_variation', 'energy_contour']
    },
    videoAnalysis: {
      facialConsistency: 0.78,
      lipSyncError: 0.05,
      confidence: 0.88
    },
    behavioralAnalysis: {
      emotionConsistency: 0.82,
      confidence: 0.90
    }
  },
  timestamp: '2026-01-20T10:30:00Z'
});
```

**Client receives:**

```javascript
socket.on('detection-update', (data) => {
  // Process detection results
  updateDetectionUI(data);
});
```

### 3. Trust Score Updates

**Server broadcasts:**

```javascript
io.to('meeting-123456789').emit('trust-score-update', {
  meetingId: '123456789',
  participantId: 'participant1',
  trustScore: 0.92,  // 0-1 scale
  timestamp: '2026-01-20T10:30:05Z'
});
```

**Client receives:**

```javascript
socket.on('trust-score-update', (data) => {
  // Update trust score visualization
  // Show color indicator: green (0.8+), yellow (0.5-0.8), red (<0.5)
  updateTrustScoreDisplay(data.participantId, data.trustScore);
});
```

### 4. Deepfake Alerts

**Server broadcasts critical alerts:**

```javascript
io.to('meeting-123456789').emit('deepfake-alert', {
  meetingId: '123456789',
  participantId: 'participant1',
  severity: 'high',  // high, medium, low
  message: 'Possible voice cloning detected',
  type: 'voice_clone_detected',
  confidence: 0.95,
  timestamp: '2026-01-20T10:30:10Z',
  actionRequired: true
});
```

**Client receives and handles:**

```javascript
socket.on('deepfake-alert', (alert) => {
  // Show prominent alert to user
  showAlert({
    type: alert.severity,
    title: alert.message,
    icon: 'warning'
  });
  
  // Log for audit trail
  logAlert(alert);
  
  // Optional: Pause audio/video
  if (alert.severity === 'high') {
    pauseParticipantMedia(alert.participantId);
  }
});
```

### 5. Analytics Updates

**Server broadcasts meeting analytics:**

```javascript
io.to('meeting-123456789').emit('analytics-update', {
  meetingId: '123456789',
  analytics: {
    totalParticipants: 5,
    anomaliesDetected: 2,
    averageTrustScore: 0.87,
    detectionModality: {
      audio: { detected: 1, confidence: 0.93 },
      video: { detected: 1, confidence: 0.85 },
      behavioral: { detected: 0, confidence: 0.98 }
    },
    cpuUsage: 45.2,
    memoryUsage: 62.8,
    processedFrames: 1250
  },
  timestamp: '2026-01-20T10:30:15Z'
});
```

**Client receives:**

```javascript
socket.on('analytics-update', (data) => {
  // Update dashboard with real-time stats
  updateAnalyticsDashboard(data.analytics);
  
  // Update system health indicators
  updateSystemHealth({
    cpu: data.analytics.cpuUsage,
    memory: data.analytics.memoryUsage
  });
});
```

### 6. Participant Events

#### Participant Joined

**Server broadcasts:**

```javascript
socket.to('meeting-123456789').emit('participant-joined', {
  userId: 'user456',
  userName: 'Jane Doe',
  timestamp: '2026-01-20T10:25:00Z'
});
```

#### Participant Left

**Server broadcasts:**

```javascript
socket.to('meeting-123456789').emit('participant-left', {
  userId: 'user456',
  timestamp: '2026-01-20T10:45:00Z'
});
```

### 7. Error Handling

**Server sends error:**

```javascript
socket.emit('error', {
  code: 'INVALID_MEETING_ID',
  message: 'Meeting ID is invalid or not provided',
  severity: 'error'
});
```

**Client handles:**

```javascript
socket.on('error', (error) => {
  console.error('Server error:', error.message);
  showUserFriendlyError(error.code);
});
```

## Broadcasting Patterns

### Broadcast to Meeting Room

```javascript
// Send to all clients in a specific meeting room
io.to(`meeting-${meetingId}`).emit('event-name', data);

// Send to all except sender
socket.to(`meeting-${meetingId}`).emit('event-name', data);
```

### Broadcast to Individual Client

```javascript
// Send to specific socket ID
io.to(socket.id).emit('event-name', data);
```

### Broadcast to All Connected Clients

```javascript
// Send to all clients
io.emit('event-name', data);
```

## Connection Statistics

**Get current connection info:**

```javascript
// Client-side
socket.on('connect', () => {
  console.log('Socket ID:', socket.id);
  console.log('Connected:', socket.connected);
});

// Server-side
const stats = websocketService.getStats();
// Returns:
// {
//   activeConnections: 12,
//   activeMeetings: 3,
//   connectedClients: [
//     { id: 'socket_id_1', connectedAt: '2026-01-20T10:00:00Z' },
//     ...
//   ]
// }
```

## Performance Optimization

### Message Throttling

```javascript
// On client - limit update frequency
let lastUpdate = 0;
const throttleMs = 500;

socket.on('detection-update', (data) => {
  const now = Date.now();
  if (now - lastUpdate >= throttleMs) {
    updateUI(data);
    lastUpdate = now;
  }
});
```

### Binary Data Transfer

For large audio/video frames, use binary:

```javascript
// Server sends binary
socket.emit('video-frame', binaryData, { binary: true });

// Client receives
socket.on('video-frame', (data) => {
  // Process binary video frame
});
```

### Compression

Socket.IO automatically compresses large messages over 1KB.

## Security

### CORS Configuration

```javascript
// In websocket.service.js
cors: {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}
```

### Authentication

```javascript
// Client sends token with connection
const socket = io('http://localhost:3001', {
  auth: {
    token: 'jwt_token_here'
  }
});

// Server validates token in middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (validateToken(token)) {
    next();
  } else {
    next(new Error('Authentication failed'));
  }
});
```

### Message Validation

Always validate incoming data:

```javascript
socket.on('detection-results', (data) => {
  if (!data.meetingId || !data.participantId) {
    socket.emit('error', { message: 'Invalid data' });
    return;
  }
  // Process valid data
});
```

## Debugging

### Enable Debug Logging

```bash
# Start server with debug
DEBUG=socket.io:* npm run dev
```

### Check Connection Status

```javascript
// Client-side
console.log('Connected:', socket.connected);
console.log('ID:', socket.id);
console.log('Rooms:', Object.keys(socket.rooms));
```

### Monitor Server Stats

```javascript
// Access via API endpoint
fetch('/api/meetings/stats/connections')
  .then(r => r.json())
  .then(stats => console.log(stats));
```

## Best Practices

1. **Always handle disconnections**
   ```javascript
   socket.on('disconnect', () => {
     // Clean up, show reconnection UI
   });
   ```

2. **Implement exponential backoff for reconnection**
   ```javascript
   const socket = io('...', {
     reconnectionDelay: 1000,
     reconnectionDelayMax: 5000,
     reconnectionAttempts: 5
   });
   ```

3. **Validate all data from server**
   ```javascript
   socket.on('event', (data) => {
     if (!validateData(data)) return;
   });
   ```

4. **Clean up event listeners**
   ```javascript
   // Remove specific listener
   socket.off('event-name', handler);
   
   // Remove all listeners
   socket.removeAllListeners();
   ```

5. **Handle missed events**
   ```javascript
   // For critical events, implement acknowledgment
   socket.emit('important-event', data, (acknowledgment) => {
     if (acknowledgment.success) {
       // Event was processed
     }
   });
   ```

## Testing

### Unit Test Example

```javascript
describe('WebSocket Service', () => {
  it('should broadcast alert to meeting room', (done) => {
    const alert = {
      meetingId: 'test-meeting',
      severity: 'high',
      message: 'Test alert'
    };
    
    websocketService.broadcastAlert('test-meeting', alert);
    
    // Verify broadcast
    io.to('meeting-test-meeting').on('deepfake-alert', (data) => {
      expect(data.message).toBe('Test alert');
      done();
    });
  });
});
```

### Integration Test Example

```javascript
describe('Client WebSocket Connection', () => {
  it('should join meeting and receive confirmation', (done) => {
    const client = io('http://localhost:3001');
    
    client.emit('join-meeting', { meetingId: 'test-123' });
    
    client.on('meeting-joined', (data) => {
      expect(data.meetingId).toBe('test-123');
      client.disconnect();
      done();
    });
  });
});
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Connection refused | Server not running | Start server with `npm run dev` |
| CORS error | Frontend origin not allowed | Update CORS_ORIGIN in .env |
| Missing events | Client not in room | Check join-meeting succeeded |
| High latency | Network/CPU bottleneck | Check server stats, optimize messages |
| Disconnect loop | Rapid reconnections | Check client-side error handler |

## Resources

- [Socket.IO Documentation](https://socket.io/docs/)
- [Socket.IO Server API](https://socket.io/docs/v4/server-api/)
- [Socket.IO Client API](https://socket.io/docs/v4/client-api/)
- [WebSocket Standard](https://tools.ietf.org/html/rfc6455)
