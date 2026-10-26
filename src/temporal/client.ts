import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import type { AppConfig } from '../config';
import type { OfferWorkflowRunner } from '../services/hotelService';
import type { fetchOffersWorkflow } from './workflows';

export interface TemporalGateway {
  runOfferWorkflow: OfferWorkflowRunner;
  ping(): Promise<void>;
  close(): Promise<void>;
}

// Worst case for a healthy run is 2 attempts x 3s activity timeout plus backoff (~7s).
const WORKFLOW_DEADLINE_MS = 15_000;

/** Rejects after `ms`. The gRPC client retries an unreachable server for a long time, so cap how long a request waits. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`workflow did not finish within ${ms}ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export function createTemporalGateway({ temporal }: AppConfig): TemporalGateway {
  // Lazy: the app can boot (and report Temporal as down on /health) before the server is reachable.
  const connection = Connection.lazy({ address: temporal.address });
  const client = new Client({ connection, namespace: temporal.namespace });

  return {
    runOfferWorkflow: (city) =>
      withDeadline(
        client.workflow.execute<typeof fetchOffersWorkflow>('fetchOffersWorkflow', {
          taskQueue: temporal.taskQueue,
          workflowId: `fetch-offers-${city}-${randomUUID()}`,
          args: [city],
          workflowExecutionTimeout: WORKFLOW_DEADLINE_MS,
        }),
        WORKFLOW_DEADLINE_MS,
      ),
    ping: async () => {
      await connection.workflowService.getSystemInfo({});
    },
    close: () => connection.close(),
  };
}
