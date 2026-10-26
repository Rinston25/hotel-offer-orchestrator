import type { FastifyInstance } from 'fastify';
import type { HotelService } from '../services/hotelService';
import type { HotelOffer, HotelResponse } from '../types/hotel';
import { hotelsQuerySchema } from '../types/schemas';

function toHotelResponse({ name, price, supplier, commissionPct }: HotelOffer): HotelResponse {
  return { name, price, supplier, commissionPct };
}

export function registerHotelRoutes(app: FastifyInstance, hotelService: HotelService): void {
  app.get('/api/hotels', async (request, reply) => {
    const { city, minPrice, maxPrice } = hotelsQuerySchema.parse(request.query);

    const { offers, degradedSuppliers } = await hotelService.search(city, { minPrice, maxPrice });

    if (degradedSuppliers.length > 0) {
      reply.header('x-degraded-suppliers', degradedSuppliers.join(','));
    }
    return offers.map(toHotelResponse);
  });
}
