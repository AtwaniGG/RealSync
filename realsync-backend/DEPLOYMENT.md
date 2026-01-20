# Deployment Guide

## Production Deployment Checklist

### Environment Setup

- [ ] Create production `.env` file
- [ ] Set `NODE_ENV=production`
- [ ] Update all credentials with production values
- [ ] Generate secure `JWT_SECRET`
- [ ] Configure CORS_ORIGIN to production URL

### Code Quality

- [ ] Run linter: `npm run lint`
- [ ] Test all endpoints
- [ ] Verify WebSocket connections
- [ ] Check error handling

### Security

- [ ] Verify HTTPS/WSS enabled
- [ ] Check CORS configuration
- [ ] Validate input sanitization
- [ ] Review authentication middleware
- [ ] Audit environment variables

### Performance

- [ ] Set up monitoring
- [ ] Configure logging
- [ ] Test under load
- [ ] Review memory usage
- [ ] Check CPU utilization

## Deployment Platforms

### AWS EC2

```bash
# SSH into instance
ssh -i key.pem ec2-user@instance-ip

# Install Node.js
curl https://nodejs.org/dist/v18.17.0/node-v18.17.0-linux-x64.tar.xz | tar xJ
export PATH=$PATH:node-v18.17.0-linux-x64/bin

# Clone repo and install dependencies
git clone <repo-url>
cd realsync-backend
npm install --production

# Start with PM2
npm install -g pm2
pm2 start server.js --name realsync-backend
pm2 save
pm2 startup
```

### Heroku

```bash
# Install Heroku CLI
npm install -g heroku

# Login to Heroku
heroku login

# Create app
heroku create realsync-backend

# Set environment variables
heroku config:set ZOOM_CLIENT_ID=...
heroku config:set ZOOM_CLIENT_SECRET=...
# ... set all other variables

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### DigitalOcean

```bash
# SSH into droplet
ssh root@droplet-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Set up the app
git clone <repo-url>
cd realsync-backend
npm install --production

# Use systemd for service management
sudo nano /etc/systemd/system/realsync.service
```

Service file content:

```ini
[Unit]
Description=RealSync Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/realsync-backend
ExecStart=/usr/bin/node /home/ubuntu/realsync-backend/server.js
Restart=always
Environment="NODE_ENV=production"
EnvironmentFile=/home/ubuntu/realsync-backend/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable realsync
sudo systemctl start realsync
sudo systemctl status realsync
```

### Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t realsync-backend .
docker run -d \
  -e NODE_ENV=production \
  -e ZOOM_CLIENT_ID=... \
  -e ZOOM_CLIENT_SECRET=... \
  -p 3001:3001 \
  realsync-backend
```

## Reverse Proxy Setup (Nginx)

```nginx
upstream realsync_backend {
  server localhost:3001;
}

server {
  listen 80;
  server_name api.realsync.com;
  
  # Redirect to HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name api.realsync.com;
  
  ssl_certificate /etc/ssl/certs/cert.pem;
  ssl_certificate_key /etc/ssl/private/key.pem;
  
  # Security headers
  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  
  # Proxy configuration
  location / {
    proxy_pass http://realsync_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  
  # WebSocket support
  location /socket.io {
    proxy_pass http://realsync_backend/socket.io;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
  }
}
```

## SSL/TLS Certificate

### Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --nginx -d api.realsync.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Self-Signed (Development)

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365
```

## Load Balancing

### Multiple Node Instances

```bash
# Install PM2 Cluster Mode
pm2 start server.js -i max --name "realsync"

# Check load balancing
pm2 monit
```

### Redis Adapter (Multi-Process WebSocket)

```javascript
// In websocket.service.js
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");

const pubClient = createClient();
const subClient = pubClient.duplicate();

this.io.adapter(createAdapter(pubClient, subClient));
```

## Monitoring & Logging

### PM2 Monitoring

```bash
# Install monitoring module
pm2 install pm2-auto-pull

# Check memory/CPU
pm2 monit

# View logs
pm2 logs realsync-backend
pm2 logs realsync-backend --err
```

### Logging Service

```javascript
// Add Winston logger
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Use in code
logger.info('Server started');
logger.error('Connection failed', error);
```

### Monitoring Services

- **DataDog**: APM + Infrastructure monitoring
- **New Relic**: Full-stack monitoring
- **Prometheus**: Metrics collection
- **ELK Stack**: Logging and analysis

## Database Deployment

### MongoDB Atlas (Managed)

1. Create cluster at mongodb.com/cloud
2. Get connection string
3. Update MONGODB_URI in .env

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/realsync?retryWrites=true&w=majority
```

### Self-Hosted MongoDB

```bash
# Install MongoDB
sudo apt-get install mongodb-org

# Start service
sudo systemctl start mongod

# Create database
mongo
> use realsync
> db.createCollection("meetings")
```

## Database Backup

### Automated Backups (MongoDB Atlas)

Built-in snapshots:
- Hourly for 24 hours
- Daily for 7 days
- Weekly for 4 weeks

### Manual Backups

```bash
# Export data
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/realsync" --out=./backup

# Import data
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net/realsync" ./backup/realsync
```

## Performance Optimization

### Node.js Cluster

```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  // Start server in each worker
}
```

### Caching Layer (Redis)

```bash
npm install redis
```

```javascript
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

// Cache meeting details
app.get('/api/meetings/:id', async (req, res) => {
  const cached = await client.get(`meeting:${req.params.id}`);
  if (cached) return res.json(JSON.parse(cached));
  
  // Fetch and cache
  const meeting = await getMeeting(req.params.id);
  await client.setex(`meeting:${req.params.id}`, 3600, JSON.stringify(meeting));
  res.json(meeting);
});
```

## Scaling Strategy

### Horizontal Scaling

1. **Load Balancer** → Multiple backend instances
2. **Shared Session Store** → Redis for session management
3. **Shared WebSocket Adapter** → Redis adapter for Socket.IO
4. **Centralized Database** → MongoDB Atlas

### Vertical Scaling

1. Increase server CPU/memory
2. Optimize Node.js heap size
3. Implement worker threads for CPU-intensive tasks

## Health Checks

### Application Health

```bash
# Service health endpoint
curl https://api.realsync.com/ping
# Expected: {"message": "pong"}
```

### Infrastructure Health

- CPU usage < 80%
- Memory usage < 85%
- Disk usage < 90%
- Response time < 500ms

## Rollback Strategy

### Blue-Green Deployment

```bash
# Blue environment (current)
# Green environment (new version)

# Deploy to green
git clone <repo> realsync-backend-green
cd realsync-backend-green && npm install

# Switch traffic
sudo systemctl stop realsync
sudo systemctl start realsync-green

# If issues: rollback to blue
sudo systemctl stop realsync-green
sudo systemctl start realsync
```

## Security Hardening

### Environment Variables

```bash
# Never hardcode credentials
export ZOOM_CLIENT_SECRET=$(aws secretsmanager get-secret-value --secret-id zoom-secret)
```

### Firewall Rules

```bash
# Allow specific ports only
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw deny 3001/tcp  # Expose via reverse proxy only
```

### DDoS Protection

- Use CloudFlare or AWS Shield
- Rate limiting middleware
- WAF rules

## Disaster Recovery

### RTO/RPO Targets

- **RTO** (Recovery Time Objective): 1 hour
- **RPO** (Recovery Point Objective): 15 minutes

### Backup Strategy

- Daily database snapshots
- Off-site backup storage
- Monthly full restore tests

## Troubleshooting

### Application Issues

```bash
# Check logs
pm2 logs realsync-backend --lines 100

# Check system resources
top
free -h
df -h

# Network diagnostics
netstat -tlnp | grep 3001
```

### WebSocket Issues

```bash
# Check connection
ws://api.realsync.com/socket.io/?transport=websocket

# Monitor connections
ss -ntap | grep 3001
```

## Documentation

- Maintain deployment runbooks
- Document all manual processes
- Keep architecture diagrams updated
- Record incident reports

## Support Contacts

- Zoom API Support
- Cloud Provider Support
- Team Lead: Aws Diab
