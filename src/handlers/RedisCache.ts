import { createClient, RedisClientType } from 'redis';
import { log } from './log.js';

class RedisCache {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.client.on('error', (err) => {
      log(`Redis Client Error: ${err}`, "err");
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      log('Connected to Redis', "info");
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      log('Disconnected from Redis', "warn");
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
      } catch (error) {
        log(`Failed to connect to Redis: ${error}`, "err");
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
      log(`Redis set error: ${error}`, "err");
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
      log(`Redis get error: ${error}`, "err");
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.connect();
      await this.client.del(key);
    } catch (error) {
      log(`Redis delete error: ${error}`, "err");
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      log(`Redis exists error: ${error}`, "err");
      return false;
    }
  }

  async flushAll(): Promise<void> {
    try {
      await this.connect();
      await this.client.flushAll();
    } catch (error) {
      log(`Redis flushAll error: ${error}`, "err");
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
      log(`Redis stats error: ${error}`, "err");
      return { keys: 0, memory: 'unknown' };
    }
  }
}

const redisCache = new RedisCache();

export default redisCache;
