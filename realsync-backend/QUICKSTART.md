# Quick Start Guide

Get the RealSync backend running in 5 minutes.

## Prerequisites
- Node.js v14+ installed
- Zoom app credentials (get from https://marketplace.zoom.us)
- Port 3001 available

## 1. Install Dependencies (1 minute)

```bash
cd /home/kali/RealSync/realsync-backend
npm install
```

## 2. Configure Environment (2 minutes)

```bash
# Edit .env file with your credentials
nano .env

# Required fields:
# ZOOM_CLIENT_ID=your_client_id
# ZOOM_CLIENT_SECRET=your_client_secret
# ZOOM_ACCOUNT_ID=your_account_id
# ZOOM_BOT_JID=your_bot_jid
```

## 3. Start Server (1 minute)

```bash
npm run dev
```

You should see:
```
✓ Server running on http://localhost:3001
✓ WebSocket enabled
```

## 4. Test Endpoints (1 minute)

```bash
# Terminal 2 - Health check
curl http://localhost:3001/ping

# Should return: {"message":"pong"}
```

## That's it! 🎉

### Next Steps

1. **Test with Frontend**
   ```javascript
   // In your React app
   const socket = io('http://localhost:3001');
   socket.emit('join-meeting', { meetingId: '123456' });
   ```

2. **Connect Detection Engine**
   - POST detection results to `/api/meetings`
   - Or use WebSocket events

3. **Read Full Documentation**
   - [README.md](README.md) - Overview
   - [ZOOM_INTEGRATION.md](ZOOM_INTEGRATION.md) - Zoom setup
   - [WEBSOCKET_GUIDE.md](WEBSOCKET_GUIDE.md) - Real-time events
   - [DEPLOYMENT.md](DEPLOYMENT.md) - Production

## Common Issues

### Server won't start
```bash
# Check if port is in use
lsof -i :3001

# Use different port
PORT=3002 npm run dev
```

### Zoom authentication error
- Check `.env` file has all 4 Zoom variables
- Verify credentials are correct in Zoom marketplace
- Ensure OAuth app is active

### Can't connect with WebSocket
- Check CORS_ORIGIN in `.env` matches your frontend URL
- Verify server is running
- Check browser console for errors

## Available Endpoints

```
GET  /ping                      - Health check
GET  /api/health                - API status
GET  /api/health/status         - Detailed status
POST /api/meetings/join         - Join meeting
POST /api/meetings/leave        - Leave meeting
GET  /api/meetings/:id/status   - Meeting status
GET  /api/meetings/stats/connections - Connection stats
```

## WebSocket Events

### Listen for Detections
```javascript
socket.on('detection-update', (data) => {
  console.log('Detection:', data);
});
```

### Listen for Alerts
```javascript
socket.on('deepfake-alert', (alert) => {
  console.log('Alert!', alert.message);
});
```

### Send Test Event
```javascript
socket.emit('join-meeting', {
  meetingId: '123456789',
  userId: 'user123'
});
```

## Configuration Reference

| Variable | Example | Required |
|----------|---------|----------|
| ZOOM_CLIENT_ID | abc123xyz | Yes |
| ZOOM_CLIENT_SECRET | secret123 | Yes |
| ZOOM_ACCOUNT_ID | acct123 | Yes |
| ZOOM_BOT_JID | botjid123 | Yes |
| PORT | 3001 | No (default 3001) |
| CORS_ORIGIN | http://localhost:3000 | No |
| JWT_SECRET | secret_key | No |
| NODE_ENV | development | No |

## Development Commands

```bash
npm run dev          # Start with auto-reload
npm run lint         # Check code style
npm start            # Production start
```

## Need Help?

1. **Check logs**: Look at console output from `npm run dev`
2. **Verify config**: Make sure `.env` has all required values
3. **Test health**: `curl http://localhost:3001/ping`
4. **Read docs**: Check [README.md](README.md) for detailed info

## What's Running

- **Express Server** on port 3001
- **WebSocket** for real-time communication
- **Zoom SDK** integration (if credentials valid)
- **CORS** enabled for frontend

## Next Commands

```bash
# Monitor server
npm run dev

# In another terminal, test API
curl http://localhost:3001/api/health/status

# Or connect frontend and test WebSocket
# See WEBSOCKET_GUIDE.md for examples
```

---

For detailed documentation, see the main [README.md](README.md)
