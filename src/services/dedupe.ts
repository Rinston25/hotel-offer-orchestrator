import type { HotelOffer } from '../types/hotel';

/** Hotels are the same hotel when their names match ignoring case and surrounding whitespace. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Cheaper wins; on equal price the higher commission wins. */
function isBetterOffer(candidate: HotelOffer, current: HotelOffer): boolean {
  if (candidate.price !== current.price) {
    return candidate.price < current.price;
  }
  return candidate.commissionPct > current.commissionPct;
}

export function sortByPrice(offers: HotelOffer[]): HotelOffer[] {
  return [...offers].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

/**
 * Collapses offers for the same hotel into the single best one.
 * On a full tie (same price and commission) the first offer seen is kept,
 * so the result only depends on the order suppliers are listed in.
 */
export function dedupeOffers(offers: HotelOffer[]): HotelOffer[] {
  const bestByName = new Map<string, HotelOffer>();

  for (const offer of offers) {
    const key = normalizeName(offer.name);
    const current = bestByName.get(key);
    if (!current || isBetterOffer(offer, current)) {
      bestByName.set(key, { ...offer, name: offer.name.trim() });
    }
  }

  return sortByPrice([...bestByName.values()]);
}
