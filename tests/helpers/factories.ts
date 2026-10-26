import type { OfferCache } from '../../src/services/cache';
import { filterByPriceRange } from '../../src/services/priceFilter';
import type { HotelOffer, PriceRange } from '../../src/types/hotel';

export function makeOffer(overrides: Partial<HotelOffer> = {}): HotelOffer {
  return {
    hotelId: 'H-1',
    name: 'Holtin',
    price: 5000,
    city: 'delhi',
    commissionPct: 10,
    supplier: 'Supplier A',
    ...overrides,
  };
}

/** Stand-in for Redis that keeps the same "null means not cached" contract. */
export class InMemoryOfferCache implements OfferCache {
  readonly store = new Map<string, HotelOffer[]>();

  async read(city: string, range: PriceRange): Promise<HotelOffer[] | null> {
    const offers = this.store.get(city);
    return offers ? filterByPriceRange(offers, range) : null;
  }

  async write(city: string, offers: HotelOffer[]): Promise<void> {
    this.store.set(city, offers);
  }
}
