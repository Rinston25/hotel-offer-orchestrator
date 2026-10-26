import { z } from 'zod';
import type { SupplierId } from './types/hotel';

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('hotel-offers'),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  SUPPLIER_A_URL: z.string().default('http://localhost:3000/supplierA/hotels'),
  SUPPLIER_B_URL: z.string().default('http://localhost:3000/supplierB/hotels'),
  SUPPLIER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  SUPPLIER_A_FAIL: booleanFlag,
  SUPPLIER_B_FAIL: booleanFlag,
  SUPPLIER_A_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
  SUPPLIER_B_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
});

export interface SupplierConfig {
  /** Full URL of the supplier's hotels endpoint. */
  url: string;
  /** Mock only: make the supplier answer with a 503. */
  fail: boolean;
  /** Mock only: artificial latency before answering. */
  delayMs: number;
}

export interface AppConfig {
  port: number;
  logLevel: string;
  redisUrl: string;
  temporal: { address: string; namespace: string; taskQueue: string };
  cacheTtlSeconds: number;
  supplierRequestTimeoutMs: number;
  suppliers: Record<SupplierId, SupplierConfig>;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    redisUrl: parsed.REDIS_URL,
    temporal: {
      address: parsed.TEMPORAL_ADDRESS,
      namespace: parsed.TEMPORAL_NAMESPACE,
      taskQueue: parsed.TEMPORAL_TASK_QUEUE,
    },
    cacheTtlSeconds: parsed.CACHE_TTL_SECONDS,
    supplierRequestTimeoutMs: parsed.SUPPLIER_REQUEST_TIMEOUT_MS,
    suppliers: {
      supplierA: { url: parsed.SUPPLIER_A_URL, fail: parsed.SUPPLIER_A_FAIL, delayMs: parsed.SUPPLIER_A_DELAY_MS },
      supplierB: { url: parsed.SUPPLIER_B_URL, fail: parsed.SUPPLIER_B_FAIL, delayMs: parsed.SUPPLIER_B_DELAY_MS },
    },
  };
}
