import type { HotelOffer, PriceRange } from '../types/hotel';

/** Inclusive on both ends; a missing bound means "unbounded". */
export function filterByPriceRange(offers: HotelOffer[], { minPrice, maxPrice }: PriceRange): HotelOffer[] {
  return offers.filter(
    (offer) =>
      (minPrice === undefined || offer.price >= minPrice) && (maxPrice === undefined || offer.price <= maxPrice),
  );
}
