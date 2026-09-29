import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureSeedData } from './data/ensureSeedData.js';
import { RefundRequest } from './models/RefundRequest.js';
import { createClassifierFromEnv } from './services/ai.service.js';

async function start() {
  const app = createApp({ classifier: createClassifierFromEnv() });
  await mongoose.connect(env.MONGO_URI);
  await ensureSeedData();
  // The idempotency-key unique index must exist before requests arrive.
  await RefundRequest.init();
  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  // Node runs as PID 1 in the container; handle stop signals explicitly so
  // `docker compose down` doesn't wait for the 10s kill timeout.
  const shutdown = () => {
    server.close(() => {
      mongoose.disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
