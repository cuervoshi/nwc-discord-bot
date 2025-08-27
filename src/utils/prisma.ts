import { PrismaClient } from '@prisma/client';

export class PrismaConfig {
  private static instance: PrismaClient | null = null;

  static async initialize(): Promise<PrismaClient> {
    if (this.instance) {
      return this.instance;
    }

    this.instance = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Test the connection
    try {
      await this.instance.$connect();
      console.log('✅ Connected to PostgreSQL database via Prisma');
    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL database:', error);
      throw error;
    }

    return this.instance;
  }

  static getClient(): PrismaClient {
    if (!this.instance) {
      throw new Error('Prisma client not initialized. Call PrismaConfig.initialize() first.');
    }
    return this.instance;
  }

  static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.$disconnect();
      this.instance = null;
    }
  }
}

// Export types for convenience
export type { Account, Faucet, Rank } from '@prisma/client';
