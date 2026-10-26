import type { Redis } from 'ioredis';
import { hotelOfferSchema } from '../types/schemas';
import type { HotelOffer, PriceRange } from '../types/hotel';

export interface OfferCache {
  /** Returns the cached offers in the range (cheapest first), or null when the city is not cached. */
  read(city: string, range: PriceRange): Promise<HotelOffer[] | null>;
  write(city: string, offers: HotelOffer[]): Promise<void>;
}

const pricesKey = (city: string): string => `hotels:${city}:prices`;
const detailsKey = (city: string): string => `hotels:${city}:details`;

/**
 * ZSET  hotels:<city>:prices   member = hotel name, score = price   -> range queries by price
 * HASH  hotels:<city>:details  field  = hotel name, value = offer   -> full offer lookup by name
 */
export class RedisOfferCache implements OfferCache {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async read(city: string, { minPrice, maxPrice }: PriceRange): Promise<HotelOffer[] | null> {
    // EXISTS and ZRANGEBYSCORE run in one MULTI so a key expiring in between cannot look like "no matches".
    const replies = await this.redis
      .multi()
      .exists(pricesKey(city))
      .zrangebyscore(pricesKey(city), minPrice ?? '-inf', maxPrice ?? '+inf')
      .exec();

    const [exists, names] = (replies ?? []).map(([error, result]) => {
      if (error) throw error;
      return result;
    });
    if (exists === 0) return null;
    if (!Array.isArray(names) || names.length === 0) return [];

    const rawOffers = await this.redis.hmget(detailsKey(city), ...(names as string[]));
    return rawOffers.flatMap((raw) => (raw === null ? [] : [hotelOfferSchema.parse(JSON.parse(raw))]));
  }

  async write(city: string, offers: HotelOffer[]): Promise<void> {
    if (offers.length === 0) return; // ZADD / HSET need at least one member

    const scoreAndName = offers.flatMap((offer) => [offer.price, offer.name]);
    const nameAndJson = offers.flatMap((offer) => [offer.name, JSON.stringify(offer)]);

    // DEL first so hotels that disappeared from the suppliers do not linger from the previous refresh.
    await this.redis
      .multi()
      .del(pricesKey(city), detailsKey(city))
      .zadd(pricesKey(city), ...scoreAndName)
      .hset(detailsKey(city), ...nameAndJson)
      .expire(pricesKey(city), this.ttlSeconds)
      .expire(detailsKey(city), this.ttlSeconds)
      .exec();
  }
}
