import Fastify, { type FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createLogger } from '../src/logger';
import { registerSupplierRoutes } from '../src/routes/suppliers';
import { aggregateOffers } from '../src/services/aggregate';
import type { OfferWorkflowRunner } from '../src/services/hotelService';
import { SUPPLIER_LABELS, type HotelResponse } from '../src/types/hotel';
import { supplierHotelsSchema } from '../src/types/schemas';
import { InMemoryOfferCache } from './helpers/factories';

const logger = createLogger('silent');

/**
 * Wires the real app (routes, service, dedupe, aggregation, mock supplier endpoints, error handler).
 * Only Temporal and Redis are replaced: the workflow runner calls the supplier endpoints directly
 * instead of going through a Temporal server, and the cache is in memory.
 */
async function setup(env: Record<string, string>) {
  const config = loadConfig(env);

  const supplierApp = Fastify();
  registerSupplierRoutes(supplierApp, config);
  await supplierApp.ready();

  const runWorkflow: jest.MockedFunction<OfferWorkflowRunner> = jest.fn((city) =>
    aggregateOffers(async (supplierId) => {
      const response = await supplierApp.inject({ url: `/${supplierId}/hotels`, query: { city } });
      if (response.statusCode !== 200) throw new Error(`${supplierId} returned ${response.statusCode}`);
      return supplierHotelsSchema
        .parse(response.json())
        .map((hotel) => ({ ...hotel, supplier: SUPPLIER_LABELS[supplierId] }));
    }),
  );

  const cache = new InMemoryOfferCache();
  const up = async (): Promise<void> => undefined;
  const app = buildApp({
    config,
    logger,
    cache,
    runWorkflow,
    probes: { redis: up, temporal: up, supplier: up },
  });
  await app.ready();

  return { app, supplierApp, cache, runWorkflow };
}

describe('GET /api/hotels with failing suppliers', () => {
  let apps: FastifyInstance[] = [];
  const start = async (env: Record<string, string>) => {
    const context = await setup(env);
    apps = [context.app, context.supplierApp];
    return context;
  };
  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('serves supplier A data and flags supplier B when B is down', async () => {
    const { app, cache } = await start({ SUPPLIER_B_FAIL: 'true' });

    const response = await app.inject({ url: '/api/hotels', query: { city: 'delhi' } });
    const hotels = response.json<HotelResponse[]>();

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-degraded-suppliers']).toBe('supplierB');
    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels.every((hotel) => hotel.supplier === 'Supplier A')).toBe(true);
    // A partial result must not be cached, otherwise the outage would be hidden for the TTL.
    expect(cache.store.has('delhi')).toBe(false);
  });

  it('still applies the price filter on degraded results', async () => {
    const { app } = await start({ SUPPLIER_B_FAIL: 'true' });

    const response = await app.inject({
      url: '/api/hotels',
      query: { city: 'delhi', minPrice: '3000', maxPrice: '5000' },
    });
    const prices = response.json<HotelResponse[]>().map((hotel) => hotel.price);

    expect(response.statusCode).toBe(200);
    expect(prices.length).toBeGreaterThan(0);
    expect(prices.every((price) => price >= 3000 && price <= 5000)).toBe(true);
  });

  it('returns 502 with a clear message when both suppliers are down', async () => {
    const { app } = await start({ SUPPLIER_A_FAIL: 'true', SUPPLIER_B_FAIL: 'true' });

    const response = await app.inject({ url: '/api/hotels', query: { city: 'delhi' } });

    expect(response.statusCode).toBe(502);
    expect(response.headers['x-degraded-suppliers']).toBe('supplierA,supplierB');
    expect(response.json()).toMatchObject({
      error: 'ALL_SUPPLIERS_FAILED',
      message: expect.stringContaining('All suppliers failed'),
    });
  });

  it('dedupes across suppliers and caches a healthy result', async () => {
    const { app, cache, runWorkflow } = await start({});

    const first = await app.inject({ url: '/api/hotels', query: { city: 'delhi' } });
    const holtin = first.json<HotelResponse[]>().filter((hotel) => hotel.name === 'Holtin');

    expect(first.headers['x-degraded-suppliers']).toBeUndefined();
    expect(holtin).toEqual([{ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 }]);
    expect(cache.store.has('delhi')).toBe(true);

    await app.inject({ url: '/api/hotels', query: { city: 'delhi', minPrice: '3000', maxPrice: '4000' } });
    expect(runWorkflow).toHaveBeenCalledTimes(1); // second call was served from the cache
  });

  it('rejects minPrice greater than maxPrice with 400', async () => {
    const { app, runWorkflow } = await start({});

    const response = await app.inject({
      url: '/api/hotels',
      query: { city: 'delhi', minPrice: '900', maxPrice: '100' },
    });

    expect(response.statusCode).toBe(400);
    expect(runWorkflow).not.toHaveBeenCalled();
  });
});
