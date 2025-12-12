import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class StateService {
  private readonly logger = new Logger(StateService.name);

  constructor(private readonly redis: Redis) {}

  async cacheSet<T>(key: string, value: T, ttlSeconds?: number) {
    try {
      await this.redis.set(
        key,
        value,
        ttlSeconds ? { ex: ttlSeconds } : undefined,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to cache data for key ${key}: ${errorMessage}`);
      throw new HttpException(
        'Failed to fetch access token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cacheGet<T>(key: string): Promise<T | null> {
    try {
      return await this.redis.get<T>(key);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to cache data for key ${key}: ${errorMessage}`);
      throw new HttpException(
        'Failed to fetch access token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async incrementRequestCount(ip: string, ttlSeconds = 60): Promise<number> {
    const key = `rate:${ip}`;
    const count = (await this.redis.incr(key)) || 0;
    if (count === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    return count;
  }

  async isRateLimited(ip: string, maxRequests: number): Promise<boolean> {
    const key = `rate:${ip}`;
    const count = (await this.redis.get<number>(key)) || 0;
    return count > maxRequests;
  }

  //   async publishNotice(channel: string, message: any) {
  //     await this.redis.publish(channel, JSON.stringify(message));
  //   }

  //   onNotice(channel: string, callback: (msg: any) => void) {
  //     // Upstash Redis supports Pub/Sub via WebSocket
  //     this.logger.log(`Subscribed to ${channel}`);
  //     // you'd hook this with @upstash/redis pub/sub client
  //   }
}
