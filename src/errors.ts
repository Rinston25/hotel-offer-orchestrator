import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { SupplierId } from './types/hotel';

/** An error we expect and know how to describe to the client. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AllSuppliersFailedError extends AppError {
  constructor(failedSuppliers: SupplierId[]) {
    super(
      502,
      'ALL_SUPPLIERS_FAILED',
      `All suppliers failed (${failedSuppliers.join(', ')}). Please try again later.`,
      { 'x-degraded-suppliers': failedSuppliers.join(',') },
    );
  }
}

export class WorkflowUnavailableError extends AppError {
  constructor() {
    super(503, 'WORKFLOW_UNAVAILABLE', 'Could not run the supplier workflow. Please try again later.');
  }
}

/** Single place where every error is turned into an HTTP response. */
export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
    void reply.status(400).send({ error: 'INVALID_REQUEST', message: 'Invalid query parameters', details });
    return;
  }

  if (error instanceof AppError) {
    request.log.warn({ err: error, code: error.code }, 'request failed');
    void reply.headers(error.headers).status(error.statusCode).send({ error: error.code, message: error.message });
    return;
  }

  request.log.error({ err: error }, 'unexpected error');
  void reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Unexpected error' });
}
