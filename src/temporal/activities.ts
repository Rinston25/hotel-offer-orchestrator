import type { AppConfig } from '../config';
import type { Logger } from '../logger';
import { fetchSupplierHotels } from '../services/supplierClient';
import { SUPPLIER_LABELS, type HotelOffer, type SupplierId } from '../types/hotel';

export function createActivities(config: AppConfig, logger: Logger) {
  return {
    /** Fetches one supplier's hotels for a city. Throwing lets Temporal apply the retry policy. */
    async fetchSupplierOffers(supplierId: SupplierId, city: string): Promise<HotelOffer[]> {
      try {
        const hotels = await fetchSupplierHotels(config, supplierId, city);
        return hotels.map((hotel) => ({ ...hotel, supplier: SUPPLIER_LABELS[supplierId] }));
      } catch (error) {
        logger.warn({ err: error, supplierId, city }, 'supplier call failed');
        throw error;
      }
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
