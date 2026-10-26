import { z } from 'zod';

const citySchema = z
  .string()
  .trim()
  .min(1, 'city is required')
  .transform((city) => city.toLowerCase());

// Parsed from a string so that an empty "?minPrice=" is rejected instead of silently becoming 0.
const priceParamSchema = z
  .string()
  .trim()
  .min(1, 'must be a number')
  .pipe(z.coerce.number({ invalid_type_error: 'must be a number' }).finite().nonnegative())
  .optional();

export const supplierQuerySchema = z.object({ city: citySchema });

export const hotelsQuerySchema = z
  .object({
    city: citySchema,
    minPrice: priceParamSchema,
    maxPrice: priceParamSchema,
  })
  .refine(
    ({ minPrice, maxPrice }) => minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice', path: ['minPrice'] },
  );

export const supplierHotelSchema = z.object({
  hotelId: z.string(),
  name: z.string(),
  price: z.number(),
  city: z.string(),
  commissionPct: z.number(),
});
export const supplierHotelsSchema = z.array(supplierHotelSchema);

export const hotelOfferSchema = supplierHotelSchema.extend({ supplier: z.string() });
