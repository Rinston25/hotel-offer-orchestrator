import { SUPPLIER_IDS, type HotelOffer, type OfferWorkflowResult, type SupplierId } from '../types/hotel';
import { dedupeOffers } from './dedupe';

export type SupplierFetcher = (supplierId: SupplierId) => Promise<HotelOffer[]>;

/**
 * Queries every supplier in parallel and merges what came back.
 * A failing supplier is reported in `degradedSuppliers` instead of failing the whole call.
 *
 * Kept free of I/O so it is safe to run inside a Temporal workflow (deterministic)
 * and easy to drive from tests with a fake fetcher.
 */
export async function aggregateOffers(fetchFromSupplier: SupplierFetcher): Promise<OfferWorkflowResult> {
  const settled = await Promise.allSettled(SUPPLIER_IDS.map((supplierId) => fetchFromSupplier(supplierId)));

  const offers: HotelOffer[] = [];
  const degradedSuppliers: SupplierId[] = [];

  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      offers.push(...outcome.value);
    } else {
      degradedSuppliers.push(SUPPLIER_IDS[index]);
    }
  });

  return { offers: dedupeOffers(offers), degradedSuppliers };
}
