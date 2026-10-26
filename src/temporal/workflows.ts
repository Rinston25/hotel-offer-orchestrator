import { proxyActivities } from '@temporalio/workflow';
import { aggregateOffers } from '../services/aggregate';
import type { OfferWorkflowResult } from '../types/hotel';
import type { Activities } from './activities';

const { fetchSupplierOffers } = proxyActivities<Activities>({
  startToCloseTimeout: '3s',
  retry: { maximumAttempts: 2, initialInterval: '250ms' },
});

/**
 * Fans out to every supplier as its own activity (own timeout + retries),
 * then dedupes. Only deterministic code lives here; all I/O is in activities.
 */
export async function fetchOffersWorkflow(city: string): Promise<OfferWorkflowResult> {
  return aggregateOffers((supplierId) => fetchSupplierOffers(supplierId, city));
}
