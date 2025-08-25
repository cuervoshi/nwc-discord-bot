import { createClient, RedisClientType } from 'redis';

class RedisCache {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('✅ Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      console.log('❌ Disconnected from Redis');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        throw error;
      }
    }
  }

  async set<T extends Record<string, any>>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.connect();
      // Remove nwcClient from serialization since it can't be properly serialized
      const valueToSerialize = { ...value };
      if ('nwcClient' in valueToSerialize) {
        delete valueToSerialize.nwcClient;
      }
      const serializedValue = JSON.stringify(valueToSerialize);
      await this.client.setEx(key, ttl / 1000, serializedValue);
    } catch (error) {
      console.error('Redis set error:', error);
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      await this.connect();
      const value = await this.client.get(key);
      if (value === null) {
        return undefined;
      }
      return JSON.parse(value as string) as T;
    } catch (error) {
      console.error('Redis get error:', error);
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.connect();
      await this.client.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  }

  async flushAll(): Promise<void> {
    try {
      await this.connect();
      await this.client.flushAll();
    } catch (error) {
      console.error('Redis flushAll error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  async getStats(): Promise<{ keys: number; memory: string }> {
    try {
      await this.connect();
      const info = await this.client.info('memory');
      const keys = await this.client.dbSize();
      
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memory = memoryMatch ? memoryMatch[1] : 'unknown';
      
      return { keys, memory };
    } catch (error) {
      console.error('Redis stats error:', error);
      return { keys: 0, memory: 'unknown' };
    }
  }
}

const redisCache = new RedisCache();

export default redisCache;
