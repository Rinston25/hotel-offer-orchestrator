import { setTimeout as sleep } from 'node:timers/promises';
import { NativeConnection, Worker } from '@temporalio/worker';
import { loadConfig } from '../config';
import { createLogger, type Logger } from '../logger';
import { createActivities } from './activities';

const CONNECT_ATTEMPTS = 30;
const CONNECT_RETRY_DELAY_MS = 2000;

/** The Temporal server can still be starting when the worker boots (docker compose), so retry. */
async function connectWithRetry(address: string, logger: Logger): Promise<NativeConnection> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await NativeConnection.connect({ address });
    } catch (error) {
      if (attempt >= CONNECT_ATTEMPTS) throw error;
      logger.warn({ err: error, attempt, address }, 'Temporal not reachable yet, retrying');
      await sleep(CONNECT_RETRY_DELAY_MS);
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const connection = await connectWithRetry(config.temporal.address, logger);
  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities: createActivities(config, logger),
  });

  logger.info({ taskQueue: config.temporal.taskQueue }, 'worker started');
  await worker.run(); // resolves after SIGINT/SIGTERM triggers a graceful shutdown
  await connection.close();
  logger.info('worker stopped');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
