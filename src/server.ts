import { Redis } from 'ioredis';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { RedisOfferCache } from './services/cache';
import { fetchSupplierHotels } from './services/supplierClient';
import { createTemporalGateway } from './temporal/client';

const HEALTH_PROBE_CITY = 'delhi';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
  redis.on('error', (error) => logger.warn({ err: error }, 'redis error'));
  const temporal = createTemporalGateway(config);

  const app = buildApp({
    config,
    logger,
    cache: new RedisOfferCache(redis, config.cacheTtlSeconds),
    runWorkflow: temporal.runOfferWorkflow,
    probes: {
      redis: async () => {
        await redis.ping();
      },
      temporal: () => temporal.ping(),
      supplier: async (supplierId) => {
        await fetchSupplierHotels(config, supplierId, HEALTH_PROBE_CITY, 1500);
      },
    },
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await temporal.close();
    redis.disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
