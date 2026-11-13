import { handleApiRequest, type WorkerEnv } from '../../server/worker-api';

export async function onRequest(context: {
  request: Request;
  env: WorkerEnv;
}): Promise<Response> {
  return handleApiRequest(context.request, context.env);
}
