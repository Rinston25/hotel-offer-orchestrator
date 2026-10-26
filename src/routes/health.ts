import type { FastifyInstance } from 'fastify';
import { SUPPLIER_IDS, type SupplierId } from '../types/hotel';

export type Probe = () => Promise<void>;

export interface HealthProbes {
  redis: Probe;
  temporal: Probe;
  supplier: (supplierId: SupplierId) => Promise<void>;
}

type Status = 'up' | 'down';

const PROBE_TIMEOUT_MS = 2000;

/** Runs a probe, never throws, and never waits longer than PROBE_TIMEOUT_MS. */
async function check(probe: Probe): Promise<Status> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('probe timed out')), PROBE_TIMEOUT_MS);
  });
  try {
    await Promise.race([probe(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export function registerHealthRoutes(app: FastifyInstance, probes: HealthProbes): void {
  app.get('/health', async (_request, reply) => {
    const [redis, temporal, ...supplierStatuses] = await Promise.all([
      check(probes.redis),
      check(probes.temporal),
      ...SUPPLIER_IDS.map((supplierId) => check(() => probes.supplier(supplierId))),
    ]);
    const suppliers = Object.fromEntries(SUPPLIER_IDS.map((id, index) => [id, supplierStatuses[index]]));

    // Suppliers are reported but do not fail the check: the service still works degraded without them.
    const healthy = redis === 'up' && temporal === 'up';
    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'unavailable',
      app: 'up',
      redis,
      temporal,
      suppliers,
    });
  });
}
