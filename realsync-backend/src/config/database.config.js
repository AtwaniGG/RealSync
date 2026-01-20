/**
 * Database Configuration
 * MongoDB connection configuration
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/realsync';

const dbConfig = {
  uri: MONGODB_URI,
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
};

module.exports = dbConfig;
