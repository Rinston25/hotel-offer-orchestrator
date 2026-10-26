import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config';
import { errorHandler } from './errors';
import type { Logger } from './logger';
import { registerHealthRoutes, type HealthProbes } from './routes/health';
import { registerHotelRoutes } from './routes/hotels';
import { registerSupplierRoutes } from './routes/suppliers';
import type { OfferCache } from './services/cache';
import { HotelService, type OfferWorkflowRunner } from './services/hotelService';

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  cache: OfferCache;
  runWorkflow: OfferWorkflowRunner;
  probes: HealthProbes;
}

/** Builds the HTTP app from injected dependencies so tests can swap Redis and Temporal out. */
export function buildApp({ config, logger, cache, runWorkflow, probes }: AppDependencies): FastifyInstance {
  // Widened so the app is a plain FastifyInstance, which is what the route registrars accept.
  const fastifyLogger: FastifyBaseLogger = logger;
  const app = Fastify({ loggerInstance: fastifyLogger });
  app.setErrorHandler(errorHandler);

  registerSupplierRoutes(app, config);
  registerHotelRoutes(app, new HotelService(cache, runWorkflow, logger));
  registerHealthRoutes(app, probes);

  return app;
}
