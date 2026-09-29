import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ensureSeedData } from './ensureSeedData.js';

// Idempotent: upserts the demo fixtures and refreshes their dates without
// deleting anything, so existing refund audit records keep valid references.
async function seed() {
  await mongoose.connect(env.MONGO_URI);
  await ensureSeedData('refresh');
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
