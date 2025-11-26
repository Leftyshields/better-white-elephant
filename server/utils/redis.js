/**
 * Redis Client Configuration
 */
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

client.on('error', (err) => console.error('Redis Client Error', err));
client.on('connect', () => console.log('✅ Redis connected'));

// Connect to Redis (lazy connection)
let connected = false;
export const connectRedis = async () => {
  if (!connected) {
    await client.connect();
    connected = true;
  }
  return client;
};

// Auto-connect on first use
connectRedis().catch((err) => {
  console.error('Failed to connect to Redis:', err);
});

export default client;
