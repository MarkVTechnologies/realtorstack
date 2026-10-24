import { env } from '../config/env.js';

type Handler = (data: any) => Promise<void>; // eslint-disable-line @typescript-eslint/no-explicit-any

const handlers = new Map<string, Handler>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bullQueue: { add: (name: string, data: unknown, opts: unknown) => Promise<unknown> } | null = null;

export function registerJob(name: string, handler: Handler) {
  handlers.set(name, handler);
}

/**
 * Background jobs (notifications, webhooks). Uses BullMQ when REDIS_URL is configured,
 * otherwise runs in-process with simple exponential-backoff retries — good enough for a pilot.
 */
export async function initQueue() {
  if (!env.REDIS_URL) return;
  const { Queue, Worker } = await import('bullmq');
  const url = new URL(env.REDIS_URL);
  const connection = { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, username: url.username || undefined };
  bullQueue = new Queue('realtorstack', { connection }) as unknown as typeof bullQueue;
  new Worker(
    'realtorstack',
    async (job) => {
      const h = handlers.get(job.name);
      if (h) await h(job.data);
    },
    { connection, concurrency: 5 },
  );
  console.log('[queue] BullMQ connected');
}

export async function enqueue(name: string, data: unknown) {
  if (bullQueue) {
    await bullQueue.add(name, data, { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 });
    return;
  }
  const handler = handlers.get(name);
  if (!handler) return;
  const run = async (attempt: number) => {
    try {
      await handler(data);
    } catch (err) {
      if (attempt >= 3) {
        console.error(`[queue] job ${name} failed permanently`, err);
        return;
      }
      setTimeout(() => void run(attempt + 1), 2 ** attempt * 1000).unref();
    }
  };
  if (env.isTest) await run(3);
  else setImmediate(() => void run(1));
}
