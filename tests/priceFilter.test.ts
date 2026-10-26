import { filterByPriceRange } from '../src/services/priceFilter';
import { hotelsQuerySchema } from '../src/types/schemas';
import { makeOffer } from './helpers/factories';

const offers = [
  makeOffer({ name: 'Budget', price: 1000 }),
  makeOffer({ name: 'Mid', price: 5000 }),
  makeOffer({ name: 'Luxury', price: 9000 }),
];
const namesOf = (list: typeof offers): string[] => list.map((offer) => offer.name);

describe('filterByPriceRange', () => {
  it('returns everything when no bounds are given', () => {
    expect(filterByPriceRange(offers, {})).toHaveLength(3);
  });

  it('applies only minPrice', () => {
    expect(namesOf(filterByPriceRange(offers, { minPrice: 5000 }))).toEqual(['Mid', 'Luxury']);
  });

  it('applies only maxPrice', () => {
    expect(namesOf(filterByPriceRange(offers, { maxPrice: 5000 }))).toEqual(['Budget', 'Mid']);
  });

  it('treats both bounds as inclusive', () => {
    expect(namesOf(filterByPriceRange(offers, { minPrice: 1000, maxPrice: 9000 }))).toHaveLength(3);
  });

  it('returns an empty list when nothing is in range', () => {
    expect(filterByPriceRange(offers, { minPrice: 2000, maxPrice: 4000 })).toEqual([]);
  });
});

describe('hotelsQuerySchema', () => {
  it('lowercases and trims the city and parses prices as numbers', () => {
    const query = hotelsQuerySchema.parse({ city: '  Delhi ', minPrice: '1000', maxPrice: '5000.5' });

    expect(query).toEqual({ city: 'delhi', minPrice: 1000, maxPrice: 5000.5 });
  });

  it('allows the price params to be omitted', () => {
    expect(hotelsQuerySchema.parse({ city: 'delhi' })).toEqual({ city: 'delhi' });
  });

  it.each([
    ['non-numeric minPrice', { city: 'delhi', minPrice: 'abc' }],
    ['non-numeric maxPrice', { city: 'delhi', maxPrice: 'cheap' }],
    ['empty minPrice', { city: 'delhi', minPrice: '' }],
    ['negative price', { city: 'delhi', minPrice: '-5' }],
    ['minPrice greater than maxPrice', { city: 'delhi', minPrice: '900', maxPrice: '100' }],
    ['missing city', { minPrice: '100' }],
  ])('rejects %s', (_label, query) => {
    expect(hotelsQuerySchema.safeParse(query).success).toBe(false);
  });
});
