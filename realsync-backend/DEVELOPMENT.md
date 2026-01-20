# Development Guidelines

## Code Structure

### File Organization

```
src/
├── app.js                              # Express app configuration
├── config/                             # Configuration files
│   ├── zoom.config.js                  # Zoom SDK config
│   └── database.config.js               # Database config
├── controllers/                        # Request handlers
│   ├── meeting.controller.js
│   └── health.controller.js
├── middleware/                         # Express middleware
│   ├── auth.middleware.js
│   └── error.middleware.js
├── models/                             # Database schemas
│   └── meeting.model.js
├── routes/                             # API routes
│   ├── index.js
│   ├── meeting.routes.js
│   └── health.routes.js
├── services/                           # Business logic
│   ├── zoom.service.js
│   └── websocket.service.js
└── utils/                              # Utility functions
    └── zoom.utils.js
```

## Naming Conventions

### Files
- Controllers: `<resource>.controller.js`
- Services: `<resource>.service.js`
- Routes: `<resource>.routes.js`
- Models: `<resource>.model.js`
- Utils: `<resource>.utils.js`

### Variables & Functions

```javascript
// Use camelCase for variables and functions
const meetingId = '123456';
function getMeetingStatus(id) {}

// Use UPPER_SNAKE_CASE for constants
const API_BASE_URL = 'https://api.zoom.us/v2';
const ERROR_CODES = {
  INVALID_ID: 'INVALID_ID',
  NOT_FOUND: 'NOT_FOUND'
};

// Use PascalCase for classes
class ZoomService {}
class WebSocketService {}
```

## Coding Standards

### JavaScript Style

```javascript
// Use strict mode
'use strict';

// Always use const by default
const value = 'string';

// Use let for reassignment
let counter = 0;

// Avoid var
// var oldStyle = 'avoid'; ❌

// Use async/await over .then()
async function fetchData() {
  try {
    const result = await someAsyncFunction();
    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Use template literals
const message = `Meeting ${meetingId} started at ${time}`;

// Use arrow functions
const filter = items => items.filter(i => i.active);

// Use destructuring
const { meetingId, userId } = req.body;
const [first, ...rest] = array;
```

### Error Handling

```javascript
// Always use try-catch for async operations
async function joinMeeting(meetingId) {
  try {
    const result = await zoomService.joinMeeting(meetingId);
    return result;
  } catch (error) {
    // Log with context
    console.error(`Failed to join meeting ${meetingId}:`, error);
    
    // Return meaningful error response
    throw new Error(`Failed to join meeting: ${error.message}`);
  }
}

// Use custom error class for application errors
class ApplicationError extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
```

### Commenting Guidelines

```javascript
// Use JSDoc for public functions
/**
 * Join a meeting with the bot
 * @param {string} meetingId - The Zoom meeting ID
 * @param {string} password - Optional meeting password
 * @returns {Promise<object>} Meeting join result
 * @throws {Error} If meeting not found or credentials invalid
 */
async function joinMeeting(meetingId, password) {
  // Implementation
}

// Explain WHY not WHAT
// ✅ Good
// Retry token generation with exponential backoff in case of temporary API failures
const token = await retryWithBackoff(() => generateZoomToken());

// ❌ Bad
// Call the function with retry
// const token = await retryWithBackoff(() => generateZoomToken());
```

### Testing

```javascript
// Test file naming: <file>.test.js
// test/zoom.service.test.js

describe('ZoomService', () => {
  describe('joinMeeting', () => {
    it('should successfully join a meeting', async () => {
      // Arrange
      const meetingId = '123456';
      
      // Act
      const result = await zoomService.joinMeeting(meetingId);
      
      // Assert
      expect(result.success).toBe(true);
    });
    
    it('should handle invalid meeting ID', async () => {
      // Arrange
      const invalidId = 'invalid';
      
      // Act & Assert
      await expect(zoomService.joinMeeting(invalidId)).rejects.toThrow();
    });
  });
});
```

## API Design

### Endpoint Naming

```
GET    /api/resource              - List all resources
GET    /api/resource/:id          - Get single resource
POST   /api/resource              - Create resource
PUT    /api/resource/:id          - Update resource
DELETE /api/resource/:id          - Delete resource
```

### Request/Response Format

```javascript
// Request body
{
  "meetingId": "123456",
  "userId": "user123"
}

// Success response (2xx)
{
  "success": true,
  "data": { /* resource data */ },
  "message": "Operation completed successfully"
}

// Error response (4xx/5xx)
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  },
  "statusCode": 400
}
```

## Async Operations

### Promise Handling

```javascript
// ✅ Use async/await
async function getData() {
  try {
    const data = await fetch('/api/data');
    return await data.json();
  } catch (error) {
    console.error('Error:', error);
  }
}

// ❌ Avoid callback hell
// getData((error, data) => {
//   if (error) console.error(error);
// });
```

## Logging

```javascript
// Use console methods appropriately
console.error('Critical error:', error);    // Errors
console.warn('Warning: deprecated API');    // Warnings
console.log('Server started on port 3001'); // Important info
console.debug('Detailed debug info');       // Debug details

// Structured logging with context
logger.info('Meeting joined', {
  meetingId: '123456',
  userId: 'user123',
  timestamp: new Date(),
  duration: 1500
});
```

## Configuration Management

```javascript
// Load from environment
const config = {
  zoom: {
    clientId: process.env.ZOOM_CLIENT_ID,
    clientSecret: process.env.ZOOM_CLIENT_SECRET,
  },
  server: {
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development',
  }
};

// Validate required config
if (!config.zoom.clientId || !config.zoom.clientSecret) {
  throw new Error('Missing required Zoom configuration');
}
```

## Security Best Practices

### Input Validation

```javascript
// Validate all user input
app.post('/api/meetings/join', (req, res) => {
  const { meetingId, password } = req.body;
  
  // Validate required fields
  if (!meetingId) {
    return res.status(400).json({ error: 'Meeting ID required' });
  }
  
  // Validate format
  if (!/^\d+$/.test(meetingId)) {
    return res.status(400).json({ error: 'Invalid meeting ID format' });
  }
  
  // Process request
});
```

### Sensitive Data Protection

```javascript
// Never log sensitive data
console.log(process.env.ZOOM_CLIENT_SECRET);  // ❌
console.log('Zoom configured');                // ✅

// Don't send sensitive data in responses
res.json({
  meetingId: '123456',
  token: process.env.JWT_SECRET  // ❌
});

res.json({
  meetingId: '123456'  // ✅
});
```

### Authentication & Authorization

```javascript
// Always verify tokens
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Use in routes
app.get('/api/protected', verifyToken, (req, res) => {
  // User is authenticated
  res.json({ user: req.user });
});
```

## Performance Tips

### Caching

```javascript
// Cache frequently accessed data
const cache = new Map();

function getCachedData(key, fetcher, ttl = 3600) {
  if (cache.has(key)) {
    const { data, expiry } = cache.get(key);
    if (Date.now() < expiry) {
      return data;
    }
  }
  
  const data = fetcher();
  cache.set(key, {
    data,
    expiry: Date.now() + ttl * 1000
  });
  return data;
}
```

### Connection Pooling

```javascript
// Reuse connections
const mongoPool = {
  minPoolSize: 10,
  maxPoolSize: 50
};

// For HTTP clients
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });
```

### Query Optimization

```javascript
// Add database indexes
db.meetings.createIndex({ userId: 1 });
db.meetings.createIndex({ createdAt: -1 });

// Select only needed fields
db.meetings.find({}, { meetingId: 1, status: 1 });

// Use pagination
async function getPage(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  return db.meetings.find()
    .skip(skip)
    .limit(limit)
    .exec();
}
```

## Debugging Tips

### Using Node Inspector

```bash
# Start with inspector
node --inspect server.js

# Or with nodemon
nodemon --inspect server.js

# Connect in Chrome: chrome://inspect
```

### Console Debugging

```javascript
// Add breakpoints with debugger
function criticalFunction() {
  debugger;  // Execution pauses when inspector is connected
  // Code here
}

// Temporary logging
console.time('operation');
// ... do work ...
console.timeEnd('operation');

// Group related logs
console.group('Database Operations');
console.log('Query time:', 125);
console.log('Results:', count);
console.groupEnd();
```

## Git Workflow

### Branch Naming

```
feature/add-zoom-integration
bugfix/fix-websocket-disconnect
hotfix/critical-auth-issue
release/v1.0.0
```

### Commit Messages

```
# Use descriptive, imperative mood
✅ Add Zoom SDK integration
✅ Fix WebSocket connection timeout
✅ Improve error handling in auth middleware

# Not
❌ Added zoom
❌ Fixed bug
❌ Updates
```

### Pull Request Template

```markdown
## Description
Brief explanation of changes

## Type of Change
- [ ] Feature
- [ ] Bug fix
- [ ] Documentation update

## Testing
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] No console errors
- [ ] Updated documentation
```

## Code Review Checklist

- [ ] Code follows naming conventions
- [ ] Error handling is comprehensive
- [ ] No sensitive data is exposed
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Performance implications considered
- [ ] Security implications reviewed

## Useful Commands

```bash
# Run linter
npm run lint

# Fix linting issues
npx eslint src/ --fix

# Development server
npm run dev

# Production build
NODE_ENV=production npm start

# View logs
pm2 logs realsync-backend

# Monitor processes
pm2 monit
```

## Resources

- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Async/Await Patterns](https://javascript.info/async-await)

## Questions?

Contact: Aws Diab (Backend Engineer)
