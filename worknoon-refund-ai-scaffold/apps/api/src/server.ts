import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';
import { ensureSeedData } from './data/ensureSeedData.js';

async function start() {
  await mongoose.connect(env.MONGO_URI);
  await ensureSeedData();
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
