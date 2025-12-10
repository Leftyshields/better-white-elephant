/**
 * Quick Redis Connection Test
 * Run: node test-redis.js
 */
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log('Testing Redis connection to:', redisUrl.replace(/:[^:@]+@/, ':****@')); // Hide password

const client = createClient({ url: redisUrl });

client.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  process.exit(1);
});

client.on('connect', () => {
  console.log('✅ Redis connected successfully!');
});

try {
  await client.connect();
  
  // Test write
  await client.set('test-key', 'test-value');
  console.log('✅ Write test: OK');
  
  // Test read
  const value = await client.get('test-key');
  console.log('✅ Read test: OK (value:', value, ')');
  
  // Cleanup
  await client.del('test-key');
  console.log('✅ Cleanup: OK');
  
  console.log('\n🎉 Redis is working correctly!');
  await client.quit();
  process.exit(0);
} catch (error) {
  console.error('❌ Redis test failed:', error.message);
  console.error('\nTroubleshooting:');
  console.error('1. Check REDIS_URL in server/.env');
  console.error('2. Ensure Redis is running (redis-cli ping)');
  console.error('3. For local: redis://localhost:6379');
  console.error('4. For cloud: Check your Redis provider connection string');
  process.exit(1);
}

