import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { createRedisClient } from '../lib/redis-client';
import { StateService } from './state.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: Redis, // inject this as the Redis instance
      useFactory: (configService: ConfigService): Redis => {
        const restUrl: string = <string>configService.get('upstash.redisUrl');
        const restToken = configService.get<string>('upstash.redisToken');
        if (!restUrl || !restToken) {
          throw new Error('Missing Upstash Redis configuration values');
        }

        return createRedisClient(restUrl, restToken);
      },
      inject: [ConfigService],
    },
    StateService,
  ],
  exports: [StateService],
})
export class StateModule {}
