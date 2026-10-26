import type { FastifyInstance } from 'fastify';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AppConfig } from '../config';
import { AppError } from '../errors';
import supplierAData from '../mocks/supplierA.json';
import supplierBData from '../mocks/supplierB.json';
import { supplierQuerySchema } from '../types/schemas';
import type { SupplierHotel, SupplierId } from '../types/hotel';

const MOCK_DATA: Record<SupplierId, Record<string, SupplierHotel[]>> = {
  supplierA: supplierAData,
  supplierB: supplierBData,
};

/**
 * Mock supplier endpoints. Behaviour is driven by config so failures can be simulated:
 *   SUPPLIER_<A|B>_FAIL=true       -> 503
 *   SUPPLIER_<A|B>_DELAY_MS=5000   -> slow answer (trips the activity timeout)
 */
export function registerSupplierRoutes(app: FastifyInstance, config: AppConfig): void {
  for (const supplierId of Object.keys(MOCK_DATA) as SupplierId[]) {
    const { fail, delayMs } = config.suppliers[supplierId];

    app.get(`/${supplierId}/hotels`, async (request) => {
      const { city } = supplierQuerySchema.parse(request.query);

      if (delayMs > 0) await sleep(delayMs);
      if (fail) throw new AppError(503, 'SUPPLIER_UNAVAILABLE', `${supplierId} is simulating a failure`);

      return MOCK_DATA[supplierId][city] ?? [];
    });
  }
}
