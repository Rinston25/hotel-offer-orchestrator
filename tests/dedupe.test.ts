import { dedupeOffers } from '../src/services/dedupe';
import { makeOffer } from './helpers/factories';

describe('dedupeOffers', () => {
  it('keeps the cheapest offer for the same hotel', () => {
    const result = dedupeOffers([
      makeOffer({ name: 'Holtin', price: 5600, supplier: 'Supplier A' }),
      makeOffer({ name: 'Holtin', price: 5340, supplier: 'Supplier B' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ price: 5340, supplier: 'Supplier B' });
  });

  it('keeps the cheapest offer regardless of input order', () => {
    const result = dedupeOffers([
      makeOffer({ name: 'Holtin', price: 5340, supplier: 'Supplier B' }),
      makeOffer({ name: 'Holtin', price: 5600, supplier: 'Supplier A' }),
    ]);

    expect(result[0].supplier).toBe('Supplier B');
  });

  it('breaks a price tie with the higher commission', () => {
    const result = dedupeOffers([
      makeOffer({ name: 'Taj Palace', price: 9200, commissionPct: 12, supplier: 'Supplier A' }),
      makeOffer({ name: 'Taj Palace', price: 9200, commissionPct: 16, supplier: 'Supplier B' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ commissionPct: 16, supplier: 'Supplier B' });
  });

  it('does not let a higher commission beat a lower price', () => {
    const result = dedupeOffers([
      makeOffer({ name: 'Lotus Inn', price: 3100, commissionPct: 10, supplier: 'Supplier A' }),
      makeOffer({ name: 'Lotus Inn', price: 3400, commissionPct: 40, supplier: 'Supplier B' }),
    ]);

    expect(result[0]).toMatchObject({ price: 3100, supplier: 'Supplier A' });
  });

  it('keeps the first offer when price and commission are both equal', () => {
    const result = dedupeOffers([
      makeOffer({ name: 'Metro Stay', price: 2200, commissionPct: 8, supplier: 'Supplier A' }),
      makeOffer({ name: 'Metro Stay', price: 2200, commissionPct: 8, supplier: 'Supplier B' }),
    ]);

    expect(result[0].supplier).toBe('Supplier A');
  });

  it('matches names ignoring case and surrounding whitespace', () => {
    const result = dedupeOffers([
      makeOffer({ name: 'Taj Palace', price: 9500 }),
      makeOffer({ name: '  TAJ PALACE ', price: 9200 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(9200);
  });

  it('returns the trimmed name of the winning offer', () => {
    const [offer] = dedupeOffers([makeOffer({ name: '  lotus inn ' })]);

    expect(offer.name).toBe('lotus inn');
  });

  it('keeps different hotels and sorts them by price', () => {
    const result = dedupeOffers([
      makeOffer({ name: 'B Hotel', price: 300 }),
      makeOffer({ name: 'A Hotel', price: 500 }),
      makeOffer({ name: 'C Hotel', price: 100 }),
    ]);

    expect(result.map((offer) => offer.name)).toEqual(['C Hotel', 'B Hotel', 'A Hotel']);
  });

  it('returns an empty list for no offers', () => {
    expect(dedupeOffers([])).toEqual([]);
  });
});
