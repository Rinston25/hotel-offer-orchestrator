import type { AppConfig } from '../config';
import { supplierHotelsSchema } from '../types/schemas';
import type { SupplierHotel, SupplierId } from '../types/hotel';

/**
 * Calls a supplier over HTTP and validates the payload.
 * Shared by the Temporal activity and the health check so both see the supplier the same way.
 */
export async function fetchSupplierHotels(
  config: AppConfig,
  supplierId: SupplierId,
  city: string,
  timeoutMs: number = config.supplierRequestTimeoutMs,
): Promise<SupplierHotel[]> {
  const url = new URL(config.suppliers[supplierId].url);
  url.searchParams.set('city', city);

  // Without our own abort the request would keep running after Temporal has timed the activity out.
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`${supplierId} responded with HTTP ${response.status}`);
  }
  return supplierHotelsSchema.parse(await response.json());
}
