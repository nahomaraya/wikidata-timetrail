import { registerAs } from '@nestjs/config';

export default registerAs('upstash', () => ({
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    redisDb: "upstash-kv-red-yacht"
    
}));
