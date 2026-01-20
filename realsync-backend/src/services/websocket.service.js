/**
 * WebSocket Service
 * Manages real-time bidirectional communication between frontend and backend
 * Handles detection results, alerts, and live streaming data
 */

class WebSocketService {
  constructor() {
    this.io = null;
    this.connections = new Map(); // Map of connected clients
    this.meetings = new Map(); // Map of active meetings
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server) {
    const { Server } = require('socket.io');
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    console.log('WebSocket Service initialized');
    return this.io;
  }

  /**
   * Setup core event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      this.connections.set(socket.id, {
        id: socket.id,
        socket,
        connectedAt: new Date(),
      });

      // Handle client disconnection
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.connections.delete(socket.id);
      });

      // Join meeting room
      socket.on('join-meeting', (data) => {
        this.handleJoinMeeting(socket, data);
      });

      // Leave meeting room
      socket.on('leave-meeting', (data) => {
        this.handleLeaveMeeting(socket, data);
      });

      // Receive detection results from backend
      socket.on('detection-results', (data) => {
        this.handleDetectionResults(socket, data);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`WebSocket error for ${socket.id}:`, error);
      });
    });
  }

  /**
   * Handle client joining a meeting
   */
  handleJoinMeeting(socket, data) {
    const { meetingId, userId } = data;

    if (!meetingId) {
      socket.emit('error', { message: 'Meeting ID required' });
      return;
    }

    socket.join(`meeting-${meetingId}`);

    if (!this.meetings.has(meetingId)) {
      this.meetings.set(meetingId, {
        id: meetingId,
        participants: new Set(),
        startedAt: new Date(),
      });
    }

    const meeting = this.meetings.get(meetingId);
    meeting.participants.add(userId || socket.id);

    console.log(`Client ${socket.id} joined meeting ${meetingId}`);

    socket.emit('meeting-joined', {
      success: true,
      meetingId,
      participants: Array.from(meeting.participants),
    });

    // Notify others in the room
    socket.to(`meeting-${meetingId}`).emit('participant-joined', {
      userId: userId || socket.id,
      timestamp: new Date(),
    });
  }

  /**
   * Handle client leaving a meeting
   */
  handleLeaveMeeting(socket, data) {
    const { meetingId } = data;

    socket.leave(`meeting-${meetingId}`);

    if (this.meetings.has(meetingId)) {
      const meeting = this.meetings.get(meetingId);
      meeting.participants.delete(data.userId || socket.id);

      if (meeting.participants.size === 0) {
        this.meetings.delete(meetingId);
      }
    }

    console.log(`Client ${socket.id} left meeting ${meetingId}`);

    socket.emit('meeting-left', {
      success: true,
      meetingId,
    });

    // Notify others in the room
    socket.to(`meeting-${meetingId}`).emit('participant-left', {
      userId: data.userId || socket.id,
      timestamp: new Date(),
    });
  }

  /**
   * Handle detection results from analysis service
   */
  handleDetectionResults(socket, data) {
    const { meetingId, participantId, results } = data;

    if (!meetingId) {
      socket.emit('error', { message: 'Meeting ID required' });
      return;
    }

    console.log(
      `Detection results received for meeting ${meetingId}, participant ${participantId}`
    );

    // Broadcast results to all clients in the meeting room
    this.io.to(`meeting-${meetingId}`).emit('detection-update', {
      meetingId,
      participantId,
      results,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast detection alert to meeting room
   */
  broadcastAlert(meetingId, alert) {
    this.io.to(`meeting-${meetingId}`).emit('deepfake-alert', {
      ...alert,
      meetingId,
      timestamp: new Date(),
    });

    console.log(`Alert broadcast to meeting ${meetingId}:`, alert.message);
  }

  /**
   * Broadcast trust score update
   */
  broadcastTrustScore(meetingId, participantId, trustScore) {
    this.io.to(`meeting-${meetingId}`).emit('trust-score-update', {
      meetingId,
      participantId,
      trustScore,
      timestamp: new Date(),
    });
  }

  /**
   * Send real-time analytics to connected clients
   */
  broadcastAnalytics(meetingId, analytics) {
    this.io.to(`meeting-${meetingId}`).emit('analytics-update', {
      meetingId,
      analytics,
      timestamp: new Date(),
    });
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      activeConnections: this.connections.size,
      activeMeetings: this.meetings.size,
      connectedClients: Array.from(this.connections.values()).map((c) => ({
        id: c.id,
        connectedAt: c.connectedAt,
      })),
    };
  }
}

// Export singleton instance
module.exports = new WebSocketService();
