import { AllSuppliersFailedError, WorkflowUnavailableError } from '../errors';
import type { Logger } from '../logger';
import { SUPPLIER_IDS, type HotelOffer, type OfferWorkflowResult, type PriceRange, type SupplierId } from '../types/hotel';
import type { OfferCache } from './cache';
import { filterByPriceRange } from './priceFilter';

export type OfferWorkflowRunner = (city: string) => Promise<OfferWorkflowResult>;

export interface SearchResult {
  offers: HotelOffer[];
  degradedSuppliers: SupplierId[];
}

export class HotelService {
  constructor(
    private readonly cache: OfferCache,
    private readonly runWorkflow: OfferWorkflowRunner,
    private readonly logger: Logger,
  ) {}

  async search(city: string, range: PriceRange): Promise<SearchResult> {
    const cachedOffers = await this.readCache(city, range);
    if (cachedOffers) {
      return { offers: cachedOffers, degradedSuppliers: [] };
    }

    const { offers, degradedSuppliers } = await this.fetchFromSuppliers(city);

    // A partial result must not be cached: it would hide the outage for the whole TTL.
    if (degradedSuppliers.length === 0) {
      await this.writeCache(city, offers);
    }
    return { offers: filterByPriceRange(offers, range), degradedSuppliers };
  }

  private async fetchFromSuppliers(city: string): Promise<OfferWorkflowResult> {
    let result: OfferWorkflowResult;
    try {
      result = await this.runWorkflow(city);
    } catch (error) {
      this.logger.error({ err: error, city }, 'supplier workflow failed');
      throw new WorkflowUnavailableError();
    }

    if (result.degradedSuppliers.length === SUPPLIER_IDS.length) {
      throw new AllSuppliersFailedError(result.degradedSuppliers);
    }
    return result;
  }

  // Redis is an optimisation: if it is down we fall back to the suppliers instead of failing the request.
  private async readCache(city: string, range: PriceRange): Promise<HotelOffer[] | null> {
    try {
      return await this.cache.read(city, range);
    } catch (error) {
      this.logger.warn({ err: error, city }, 'cache read failed, treating as miss');
      return null;
    }
  }

  private async writeCache(city: string, offers: HotelOffer[]): Promise<void> {
    try {
      await this.cache.write(city, offers);
    } catch (error) {
      this.logger.warn({ err: error, city }, 'cache write failed, continuing without cache');
    }
  }
}
