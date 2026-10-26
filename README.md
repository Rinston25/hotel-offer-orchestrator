# hotel-offer-orchestrator

A small backend service that fetches hotel offers from two suppliers in parallel, deduplicates them,
caches the result in Redis and serves it with optional price filtering. Supplier calls are orchestrated
by Temporal, so each call has its own timeout and retry policy and every run is visible in the Temporal UI.

Node 20 · TypeScript (strict) · Fastify · ioredis · Temporal · Zod · pino · Jest

## Architecture

```
                      ┌───────────────────────── app (Fastify) ─────────────────────────┐
  GET /api/hotels     │                                                                  │
 ───────────────────► │  hotels route ─► HotelService ──hit──► Redis (ZSET + HASH)       │
                      │        │              │ miss                                     │
                      │  zod-validated        ▼                                          │
                      │  query          Temporal client ──────────────┐                  │
                      │                                               │                  │
  GET /supplierA|B/   │  mock supplier routes (hardcoded JSON) ◄──┐   │                  │
      hotels          │                                           │   │                  │
                      └───────────────────────────────────────────┼───┼──────────────────┘
                                                                  │   ▼
                                       Temporal server (+ Postgres)  task queue "hotel-offers"
                                                                  │   │
                      ┌──────────────── worker ───────────────────┼───┼──────┐
                      │ fetchOffersWorkflow                       │   │      │
                      │   ├─ activity fetchSupplierOffers(A) ─────┘   │      │
                      │   ├─ activity fetchSupplierOffers(B) ─────────┘      │
                      │   │      (3s timeout, 2 attempts each, in parallel)  │
                      │   └─ dedupe ─► { offers, degradedSuppliers }         │
                      └──────────────────────────────────────────────────────┘
```

Request flow for `GET /api/hotels?city=delhi`:

1. The query is validated with Zod (`400` if invalid).
2. `HotelService` looks in Redis. On a hit it answers straight from the cache.
3. On a miss it starts `fetchOffersWorkflow`. The workflow runs one activity per supplier in parallel and
   dedupes whatever came back. A supplier whose activity ultimately fails is reported in `degradedSuppliers`.
4. A complete result is written to Redis (with a TTL), then the price filter is applied and the response is sent.

The mock suppliers live in the same app (`/supplierA/hotels`, `/supplierB/hotels`). The worker reaches them
over HTTP, exactly as it would reach real suppliers.

### Project layout

```
src/
  server.ts            process entrypoint (wiring + graceful shutdown)
  app.ts               builds the Fastify app from injected dependencies
  config.ts            env parsing (zod)
  errors.ts            AppError types + the single error handler
  routes/              hotels.ts, suppliers.ts (mocks), health.ts
  temporal/            workflows.ts, activities.ts, worker.ts, client.ts
  services/            dedupe.ts, priceFilter.ts, aggregate.ts, cache.ts, hotelService.ts, supplierClient.ts
  mocks/               supplierA.json, supplierB.json
  types/               domain types + zod schemas
tests/
```

## Run it

```bash
docker compose up --build
```

That starts the API (`:3000`), the Temporal worker, Redis, the Temporal server with Postgres, and the
Temporal UI (`:8233`). Nothing else is needed; `app` and `worker` wait for Redis and Temporal to be healthy.

Local development without Docker: start Redis and Temporal yourself (e.g. `temporal server start-dev`),
copy `.env.example` to your environment, then

```bash
npm ci
npm run build
npm run start:worker   # terminal 1
npm run start:app      # terminal 2
```

Tests (no Redis or Temporal required):

```bash
npm test
npm run typecheck
```

## API and curl examples

Supported cities: `delhi`, `mumbai`, `bangalore`. An unknown city returns `[]`.

### Mock suppliers

```bash
curl "localhost:3000/supplierA/hotels?city=delhi"
curl "localhost:3000/supplierB/hotels?city=delhi"
```

Each hotel has `hotelId`, `name`, `price`, `city`, `commissionPct`. Several hotels exist in both suppliers
under slightly different spellings (`Taj Palace` / `  TAJ PALACE `), with different or equal prices.

### Search

```bash
curl "localhost:3000/api/hotels?city=delhi"
```

```json
[
  { "name": "Metro Stay", "price": 2200, "supplier": "Supplier A", "commissionPct": 8 },
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 }
]
```

Results are sorted by price, cheapest first.

### Price range

```bash
curl "localhost:3000/api/hotels?city=delhi&minPrice=3000&maxPrice=6000"
curl -i "localhost:3000/api/hotels?city=delhi&minPrice=900&maxPrice=100"   # 400
curl -i "localhost:3000/api/hotels?city=delhi&minPrice=abc"                # 400
```

Both bounds are inclusive and optional. Invalid input returns:

```json
{ "error": "INVALID_REQUEST", "message": "Invalid query parameters",
  "details": [{ "field": "minPrice", "message": "minPrice must be less than or equal to maxPrice" }] }
```

### Health

```bash
curl -i localhost:3000/health
```

```json
{ "status": "ok", "app": "up", "redis": "up", "temporal": "up",
  "suppliers": { "supplierA": "up", "supplierB": "up" } }
```

`200` when Redis and Temporal are up, `503` otherwise. Supplier status is reported but does not affect the
status code, because the service keeps working with one supplier down.

### Inspect the cache

```bash
docker compose exec redis redis-cli ZRANGE hotels:delhi:prices 0 -1 WITHSCORES
docker compose exec redis redis-cli HGETALL hotels:delhi:details
docker compose exec redis redis-cli TTL hotels:delhi:prices
```

## Bruno collection

Open the `bruno/` folder in Bruno and select the `local` environment, or from the CLI:

```bash
cd bruno && npx @usebruno/cli run --env local
```

Requests 1-7 run against a healthy stack. Request 8 only passes with `SUPPLIER_B_FAIL=true` and an empty cache (see its docs tab).

## Simulating a supplier failure

The flags are read by the app, which serves the mock suppliers.

```bash
# Supplier B answers 503
SUPPLIER_B_FAIL=true docker compose up --build

# Supplier B answers after 5s, which exceeds the 3s activity timeout
SUPPLIER_B_DELAY_MS=5000 docker compose up --build
```

(`SUPPLIER_A_FAIL` and `SUPPLIER_A_DELAY_MS` work the same way. On PowerShell use `$env:SUPPLIER_B_FAIL="true"; docker compose up --build`.)

One supplier down, the other still answers, and the response says which one is missing:

```bash
curl -i "localhost:3000/api/hotels?city=delhi"
# HTTP/1.1 200 OK
# x-degraded-suppliers: supplierB
```

Both down returns `502`:

```json
{ "error": "ALL_SUPPLIERS_FAILED", "message": "All suppliers failed (supplierA, supplierB). Please try again later." }
```

Note that a *timeout* takes longer than a plain failure: 2 attempts x 3s, so about 6.5s before the supplier is
given up on. The retry attempts are visible in the Temporal UI at http://localhost:8233.

## Design decisions

**Why ZSET + HASH.** The price filter is a range query on a number, which is exactly what a sorted set is for:
`ZRANGEBYSCORE hotels:<city>:prices min max` is O(log N + M) and returns names already ordered by price.
A ZSET member can only be a string, though, and I did not want to pack the whole offer into the member. So the
full offer lives in a HASH keyed by the same hotel name and is fetched with one `HMGET`. A filtered read is
always two round trips regardless of result size, and a request without a filter uses `-inf`/`+inf`
through the same code path. Writes go through `MULTI` (DEL, ZADD, HSET, EXPIRE x2), so readers never see a
half-written city and hotels that vanished from the suppliers do not linger.

**Why Temporal.** Calling two suppliers with `Promise.all` is easy; what Temporal adds is per-call timeouts and
retry policies that are declared rather than hand-rolled, durable state if the worker restarts mid-run, and a
history of every supplier call (who failed, how often, how long) in the UI. The workflow itself holds only
deterministic logic (fan out, merge, dedupe). All I/O is in activities. Each supplier call is its own activity
(3s `startToCloseTimeout`, 2 attempts) and the workflow uses `Promise.allSettled`, so one supplier exhausting
its retries becomes a `degradedSuppliers` entry instead of failing the whole workflow.

**Dedupe rules.** Offers are the same hotel when `name.trim().toLowerCase()` matches. Among duplicates the
cheapest wins; on an equal price the higher `commissionPct` wins; on a complete tie the first one seen
(Supplier A) wins, so the result is deterministic. The winning offer keeps its trimmed original casing.
The logic is a pure function in `services/dedupe.ts`.

**Cache TTL.** Ten minutes by default (`CACHE_TTL_SECONDS`). Hotel prices move slowly relative to the cost of
two supplier round trips, and a bounded TTL caps how stale an offer can be without any invalidation code.
Both keys get the same TTL in the same `MULTI`, so they expire together.

**Partial results are not cached.** If a supplier is down the response is served but not written to Redis.
Otherwise a 30 second outage would be baked in for the whole TTL, and the `x-degraded-suppliers` header would
disappear on the next request even though the data is still incomplete. The cost is that during an outage each
request re-runs the workflow; see "with more time" for a short negative TTL.

**Redis is an optimisation, not a dependency of correctness.** If a cache read or write fails the error is
logged and the request falls back to the suppliers. `/health` still reports Redis as down.

**Other choices.**
- `buildApp` takes its dependencies (cache, workflow runner, health probes) as arguments, which is what makes
  the integration test possible without Redis or a Temporal server.
- Errors: validation errors, domain errors (`AppError`) and unexpected errors all flow through one Fastify error
  handler. Unexpected errors never leak internals to the client.
- Logging is structured JSON via pino, used by Fastify (request ids included), the worker and the activities.
- Supplier payloads are validated with Zod at the boundary, so a malformed response counts as a supplier failure.
- Temporal client connects lazily and the worker retries its connection, so start order does not matter.

## Tests

- `tests/dedupe.test.ts`: cheapest wins, tie goes to higher commission, case/whitespace-insensitive names.
- `tests/priceFilter.test.ts`: the range filter and the query validation (`minPrice <= maxPrice`, numeric).
- `tests/degradedSuppliers.integration.test.ts`: the real HTTP app with real mock supplier routes and real
  aggregation/dedupe, with Redis and Temporal swapped for an in-memory cache and a direct runner. Covers one
  supplier down (200 + `x-degraded-suppliers`), both down (502), caching, and 400 on a bad range.

What is not covered by automated tests: the Temporal workflow running on a real Temporal server and the Redis
commands against a real Redis. I verified the workflow bundles with the Temporal worker bundler; an end-to-end
run needs `docker compose up`.

## What I would add with more time

- End-to-end tests against real Redis and Temporal (Testcontainers, or `TestWorkflowEnvironment` for the workflow).
- Single-flight: a deterministic workflow id per city so concurrent cache misses share one workflow run
  instead of each starting their own (a cache stampede on a cold or just-expired city).
- A short negative/partial-result TTL (a few seconds) so an outage does not turn every request into a workflow run,
  and stale-while-revalidate to refresh the cache before it expires.
- Circuit breaker per supplier so a known-bad supplier is skipped instead of burning 6s of timeouts and retries.
- Pagination and sorting options on `/api/hotels`, and a check-in/out date in the cache key (it is price-per-city today).
- Metrics (Prometheus) for cache hit ratio, per-supplier latency and failure rate, and OpenTelemetry tracing
  from the HTTP request through the workflow.
- Auth and rate limiting on the public API, and separating the mock suppliers into their own service.
- CI pipeline (typecheck, test, image build) and a lint config.
