# RealSync Backend

Deepfake Detection System - Backend Service

Real-time detection of AI-generated audio, video, and behavioral anomalies during Zoom meetings using multi-modal analysis.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React)                       │
└──────────────────┬──────────────────────────────────────┘
                   │ WebSocket / HTTP
                   │
┌──────────────────▼──────────────────────────────────────┐
│           Node.js/Express Backend                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │         API Routes & Controllers                │   │
│  └─────────────────────────────────────────────────┘   │
│                   │                                      │
│  ┌────────────────┴────────────────┐                   │
│  │                                  │                   │
│  ▼                                  ▼                   │
│ ┌──────────────────────┐  ┌──────────────────────┐     │
│ │  Zoom Service        │  │ WebSocket Service    │     │
│ │ (Bot Integration)    │  │ (Real-time Comms)    │     │
│ └──────────────────────┘  └──────────────────────┘     │
└─────────────────────────────────────────────────────────┘
         │                            │
         │ Zoom SDK                   │ WebSocket Events
         ▼                            ▼
    ┌─────────────┐          ┌──────────────┐
    │ Zoom API    │          │ Connected    │
    │ Meetings    │          │ Clients      │
    └─────────────┘          └──────────────┘
```

## Core Features

### 1. **Zoom SDK Integration**
- Bot joins meetings automatically via Zoom SDK
- Real-time audio/video stream capture
- Meeting lifecycle management (join/leave)

### 2. **WebSocket Communication**
- Real-time bidirectional communication between frontend and backend
- Meeting room management
- Broadcast detection results and alerts
- Live analytics streaming

### 3. **API Endpoints**
- Meeting management (join/leave)
- Meeting status queries
- Health checks and system status

## Project Structure

```
realsync-backend/
├── src/
│   ├── app.js                          # Express app configuration
│   ├── config/
│   │   ├── zoom.config.js              # Zoom SDK configuration
│   │   └── database.config.js           # MongoDB configuration
│   ├── controllers/
│   │   ├── meeting.controller.js       # Meeting API handlers
│   │   └── health.controller.js        # Health check handlers
│   ├── services/
│   │   ├── zoom.service.js             # Zoom SDK integration service
│   │   └── websocket.service.js        # WebSocket management service
│   ├── routes/
│   │   ├── index.js                    # Main router
│   │   ├── meeting.routes.js           # Meeting endpoints
│   │   └── health.routes.js            # Health endpoints
│   ├── middleware/
│   │   ├── auth.middleware.js          # JWT authentication
│   │   └── error.middleware.js         # Error handling
│   ├── utils/
│   │   └── zoom.utils.js               # Zoom utility functions
│   └── models/                         # Database schemas (MongoDB)
├── server.js                           # Server entry point
├── package.json                        # Dependencies and scripts
├── .env                                # Environment variables
├── .env.example                        # Example environment file
└── README.md                           # This file
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd realsync-backend
npm install
```

### 2. Configure Environment Variables

Create a `.env` file (copy from `.env.example`) and fill in your Zoom credentials:

```bash
# Copy the example file
cp .env.example .env

# Edit .env with your actual values
nano .env
```

**Required Environment Variables:**

- `ZOOM_CLIENT_ID` - Your Zoom app client ID
- `ZOOM_CLIENT_SECRET` - Your Zoom app client secret
- `ZOOM_ACCOUNT_ID` - Your Zoom account ID
- `ZOOM_BOT_JID` - Your Zoom bot JID
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Frontend URL for CORS
- `JWT_SECRET` - Secret key for JWT tokens

### 3. Set Up Zoom SDK

1. Go to [Zoom Marketplace](https://marketplace.zoom.us)
2. Create a new Server-to-Server OAuth application
3. Get your credentials:
   - Client ID
   - Client Secret
   - Account ID
4. Configure your bot with meeting capabilities

### 4. Start Development Server

```bash
# Run with auto-reload
npm run dev

# Or run production version
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### Health & Status

```
GET  /ping                    - Simple health check
GET  /api/health              - API health status
GET  /api/health/status       - Detailed system status
```

### Meeting Management

```
POST /api/meetings/join       - Bot joins a meeting
POST /api/meetings/leave      - Bot leaves a meeting
GET  /api/meetings/:id/status - Get meeting status
GET  /api/meetings/stats/connections - WebSocket connection stats
```

## WebSocket Events

### Client Events (Frontend → Backend)

```javascript
// Join a meeting
socket.emit('join-meeting', {
  meetingId: 'string',
  userId: 'string' (optional)
})

// Leave a meeting
socket.emit('leave-meeting', {
  meetingId: 'string'
})

// Send detection results
socket.emit('detection-results', {
  meetingId: 'string',
  participantId: 'string',
  results: { /* detection data */ }
})
```

### Server Events (Backend → Frontend)

```javascript
// Meeting joined
socket.on('meeting-joined', {
  success: true,
  meetingId: 'string',
  participants: ['user1', 'user2']
})

// Detection update
socket.on('detection-update', {
  meetingId: 'string',
  participantId: 'string',
  results: { /* detection results */ },
  timestamp: 'ISO string'
})

// Deepfake alert
socket.on('deepfake-alert', {
  meetingId: 'string',
  message: 'Alert message',
  severity: 'high|medium|low',
  timestamp: 'ISO string'
})

// Trust score update
socket.on('trust-score-update', {
  meetingId: 'string',
  participantId: 'string',
  trustScore: 0.95,
  timestamp: 'ISO string'
})

// Analytics update
socket.on('analytics-update', {
  meetingId: 'string',
  analytics: { /* analytics data */ },
  timestamp: 'ISO string'
})
```

## Testing

### Manual API Testing with cURL

```bash
# Health check
curl http://localhost:3001/ping

# API status
curl http://localhost:3001/api/health

# System status
curl http://localhost:3001/api/health/status
```

### WebSocket Testing

Use a WebSocket client like:
- [Postman WebSocket Client](https://www.postman.com/)
- [wscat CLI](https://github.com/TooTallNate/ws)

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:3001
```

## Development

### Code Linting

```bash
npm run lint
```

### Environment Setup

**Development:**
```bash
NODE_ENV=development npm run dev
```

**Production:**
```bash
NODE_ENV=production npm start
```

## Zoom SDK Integration Details

### Authentication Flow

1. **Server-to-Server OAuth**
   - Backend authenticates using client ID and secret
   - Receives access token valid for 1 hour
   - Token automatically refreshed when needed

2. **Bot Meeting Participation**
   - Bot receives Zoom meeting invite
   - Joins with proper credentials
   - Captures audio/video streams
   - Sends data to detection services

### Meeting Bot Lifecycle

```
[Bot Receives Invite] 
        ↓
[Authenticate with Zoom]
        ↓
[Join Meeting]
        ↓
[Capture Audio/Video Streams]
        ↓
[Real-time Detection Analysis]
        ↓
[Send Results via WebSocket]
        ↓
[Generate Post-Meeting Report]
        ↓
[Leave Meeting]
```

## Security Considerations

1. **JWT Authentication**
   - All API endpoints (except health) should require JWT tokens
   - Tokens expire after configured duration

2. **WebSocket Security**
   - CORS validation for WebSocket connections
   - Client-side authentication via JWT tokens

3. **Data Privacy**
   - All data encrypted in transit (HTTPS/WSS)
   - No raw media stored permanently
   - Compliance with GDPR/CCPA requirements

4. **Environment Variables**
   - Never commit `.env` file
   - Use `.env.example` as template
   - Rotate secrets regularly

## Troubleshooting

### Zoom SDK Connection Issues

```
Error: "Failed to generate Zoom token"
```

**Solution:** Verify your Zoom credentials in `.env` file

### WebSocket Connection Failures

```
Error: "WebSocket connection refused"
```

**Solution:** Ensure server is running and CORS_ORIGIN is correctly configured

### Port Already in Use

```
Error: "EADDRINUSE: address already in use :::3001"
```

**Solution:** Change PORT in `.env` or kill the process using the port

## Next Steps

1. **Implement Detection Services**
   - Audio analysis engine
   - Video analysis engine
   - Behavioral analysis engine

2. **Database Models**
   - User models
   - Meeting records
   - Detection results storage

3. **Enhanced Error Handling**
   - Retry logic for Zoom API failures
   - Graceful degradation

4. **Performance Optimization**
   - Stream processing optimization
   - Database indexing
   - Caching strategies

## Resources

- [Zoom Meeting SDK Documentation](https://developers.zoom.us/docs/sdk/native-sdks/web/)
- [Express.js Documentation](https://expressjs.com/)
- [Socket.io Documentation](https://socket.io/docs/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## License

ISC

## Author

Aws Diab - Backend Engineer
