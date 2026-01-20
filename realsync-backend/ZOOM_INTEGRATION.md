# Zoom SDK Integration Guide

## Overview

RealSync uses the Zoom Meeting SDK to enable a bot to join meetings and analyze audio/video streams in real-time. This guide explains the Zoom integration architecture and how to set it up.

## Architecture

### Zoom Bot Flow

```
1. User initiates deepfake detection
   ↓
2. Backend receives meeting invitation
   ↓
3. Bot authenticates via Server-to-Server OAuth
   ↓
4. Bot joins Zoom meeting
   ↓
5. Real-time audio/video stream capture begins
   ↓
6. Detection engines process streams
   ↓
7. Results sent to frontend via WebSocket
   ↓
8. Post-meeting reports generated
```

## Setup Instructions

### Step 1: Create Zoom App

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us)
2. Login or create an account
3. Click "Develop" → "Build App"
4. Select "Server-to-Server OAuth App"
5. Fill in the app details

### Step 2: Get Credentials

After creating the app, you'll get:

- **Client ID**: Used for authentication
- **Client Secret**: Secret key (keep this secure!)
- **Account ID**: Your Zoom account identifier
- **Bot JID**: Unique identifier for your bot

### Step 3: Configure Environment Variables

Update `.env` file with these credentials:

```env
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
ZOOM_ACCOUNT_ID=your_account_id
ZOOM_BOT_JID=your_bot_jid
```

## Server-to-Server OAuth Flow

The backend uses Server-to-Server OAuth for secure authentication:

```
┌──────────────────┐
│   RealSync       │
│   Backend        │
└────────┬─────────┘
         │
         │ 1. Send Client ID + Secret
         │    (base64 encoded)
         ▼
┌──────────────────────────┐
│   Zoom OAuth Server      │
│ /oauth/token             │
└────────┬─────────────────┘
         │
         │ 2. Return Access Token
         │    (valid for 1 hour)
         ▼
┌──────────────────┐
│   RealSync       │
│   Backend        │
│ (Token cached)   │
└──────────────────┘
```

### Token Generation

```javascript
// Automatic in ZoomService.initialize()
const token = await zoomUtils.generateZoomToken();

// Token is cached and auto-refreshed before expiry
// Manual refresh available:
const validToken = await zoomService.getValidToken();
```

## API Endpoints Used

### Get Meeting Details

```
GET /v2/meetings/{meetingId}
Headers: Authorization: Bearer {access_token}

Response:
{
  "id": 123456789,
  "topic": "My Meeting",
  "type": 2,
  "status": "started",
  "start_time": "2026-01-20T10:00:00Z",
  "duration": 60,
  ...
}
```

### Meeting Bot Participation

The bot is added to meetings through:

1. **Direct Invite**: Calendar invite sent to bot email
2. **Meeting Link**: Bot joins via special authentication
3. **Webhook Events**: Real-time notification of meeting events

## Zoom Webhook Events

Configure webhooks in your Zoom app settings to receive real-time events:

### Meeting Started Event

```json
{
  "event": "meeting.started",
  "payload": {
    "object": {
      "id": 123456789,
      "uuid": "abc123==",
      "participant_id": "bot_id",
      "host_id": "user_id"
    }
  }
}
```

### Participant Joined Event

```json
{
  "event": "meeting.participant_joined",
  "payload": {
    "object": {
      "participant": {
        "id": "participant_id",
        "user_name": "John Doe"
      }
    }
  }
}
```

## Audio/Video Stream Processing

### Real-Time Stream Capture

The bot captures streams and processes them:

```javascript
// Audio Stream
- Raw audio bytes from all participants
- Encoded in PCM format
- Transmitted via WebSocket to analysis engine

// Video Stream
- H.264 encoded video
- Multiple participant streams
- VP8/VP9 codec support
```

### Stream Quality Settings

Configure in Zoom app settings:
- Audio quality: 16kHz, 16-bit mono (for analysis)
- Video quality: 720p (standard), 1080p (premium)
- Frame rate: 30 FPS

## Error Handling

### Common Issues

#### 1. Invalid Credentials

```
Error: "Failed to generate Zoom token"
Status: 400
Cause: Invalid Client ID or Secret
Solution: Verify .env credentials
```

#### 2. Unauthorized Meeting Access

```
Error: "Bot not authorized to join meeting"
Status: 403
Cause: Bot JID not properly configured
Solution: Update ZOOM_BOT_JID in .env
```

#### 3. Meeting Not Found

```
Error: "Meeting not found"
Status: 404
Cause: Invalid meeting ID or meeting ended
Solution: Verify meeting ID and check meeting status
```

### Retry Logic

The backend automatically retries failed token generation:

```javascript
// Retries: 3 times with exponential backoff
// Backoff: 1s, 2s, 4s
// Max wait: 7 seconds
```

## Security Best Practices

### 1. Credential Security

- Never commit `.env` file to version control
- Rotate Client Secret periodically
- Use environment-specific secrets

### 2. Token Management

- Tokens auto-refresh before expiry
- Tokens never stored in logs
- Use HTTPS for all API calls

### 3. Webhook Validation

```javascript
// Validate webhook signature
const isValid = validateZoomWebhookSignature(req, zoomSecret);
```

Zoom includes `x-zm-signature` header with HMAC SHA-256 hash.

### 4. Data Privacy

- Raw media not stored permanently
- Streams encrypted in transit
- GDPR/CCPA compliant processing

## Testing

### Manual Testing

#### 1. Get Access Token

```bash
curl -X POST https://zoom.us/oauth/token \
  -H "Authorization: Basic $(echo -n $CLIENT_ID:$CLIENT_SECRET | base64)" \
  -d "grant_type=client_credentials"
```

#### 2. Get Meeting Info

```bash
curl -X GET https://api.zoom.us/v2/meetings/{meetingId} \
  -H "Authorization: Bearer {access_token}"
```

#### 3. Test WebSocket Connection

```bash
# Using wscat
wscat -c ws://localhost:3001

# Send test message
{"event": "join-meeting", "meetingId": "123456"}
```

### Unit Testing

```javascript
// test/zoom.service.test.js
describe('ZoomService', () => {
  it('should generate valid token', async () => {
    const token = await zoomService.getValidToken();
    expect(token).toBeDefined();
  });
});
```

## Advanced Configuration

### Custom Meeting Parameters

```javascript
const options = {
  password: 'meeting_password',
  mute_on_entry: false,
  waiting_room: false,
  record_on_start: true,
};

await zoomService.joinMeeting(meetingId, password);
```

### Rate Limiting

Zoom API has rate limits:
- 300 requests per 5 minutes per IP
- 30 requests per second for OAuth token endpoint

Current implementation handles this automatically with backoff.

### Scaling Considerations

For multiple simultaneous meetings:
- Use meeting-specific WebSocket rooms
- Implement connection pooling
- Scale horizontally with load balancer

## Troubleshooting Checklist

- [ ] Verify ZOOM_CLIENT_ID in .env
- [ ] Verify ZOOM_CLIENT_SECRET in .env
- [ ] Check ZOOM_ACCOUNT_ID is correct
- [ ] Verify bot has meeting capabilities enabled
- [ ] Check firewall allows outbound HTTPS
- [ ] Verify JWT tokens are valid
- [ ] Check WebSocket connection established
- [ ] Review server logs for errors
- [ ] Validate meeting ID format
- [ ] Confirm user has Zoom account

## Resources

- [Zoom Meeting SDK Docs](https://developers.zoom.us/docs/sdk/overview/)
- [Zoom API Reference](https://developers.zoom.us/docs/api/)
- [Server-to-Server OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/)
- [Webhook Documentation](https://developers.zoom.us/docs/api/webhooks/)

## Support

For issues:
1. Check Zoom API status dashboard
2. Review backend logs: `npm run dev`
3. Verify .env configuration
4. Contact Zoom Support for account-level issues
