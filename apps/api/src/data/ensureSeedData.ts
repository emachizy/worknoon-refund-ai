import { Customer } from '../models/Customer.js';
import { Order } from '../models/Order.js';
import { seedCustomers, seedOrders } from './seedData.js';

const DAY_MS = 86_400_000;

/**
 * Upserts the synthetic demo customers/orders keyed on their unique fields
 * (customer email, order number), so it is safe to run on every startup and
 * never creates duplicates.
 *
 * - mode 'insert-missing' (startup): only inserts records that don't exist yet;
 *   existing documents are left untouched.
 * - mode 'refresh' (manual seed script): also resets existing demo records to
 *   the fixture values, including order dates relative to now.
 */
export async function ensureSeedData(mode: 'insert-missing' | 'refresh' = 'insert-missing') {
  // Make sure unique indexes exist before relying on them.
  await Promise.all([Customer.init(), Order.init()]);

  const op = mode === 'refresh' ? '$set' : '$setOnInsert';

  const customerResult = await Customer.bulkWrite(
    seedCustomers.map((customer) => ({
      updateOne: { filter: { email: customer.email }, update: { [op]: customer }, upsert: true }
    }))
  );

  const customers = await Customer.find({ email: { $in: seedCustomers.map((c) => c.email) } }, { email: 1 }).lean();
  const idByEmail = new Map(customers.map((c) => [c.email, c._id]));

  const now = Date.now();
  const orderResult = await Order.bulkWrite(
    seedOrders.map(({ customerEmail, daysAgo, ...order }) => {
      const customerId = idByEmail.get(customerEmail);
      if (!customerId) throw new Error(`Seed customer missing for ${customerEmail}`);
      return {
        updateOne: {
          filter: { orderNumber: order.orderNumber },
          update: { [op]: { ...order, customerId, orderedAt: new Date(now - daysAgo * DAY_MS), status: 'delivered' } },
          upsert: true
        }
      };
    })
  );

  console.log(
    `Seed (${mode}): ${customerResult.upsertedCount} customers and ${orderResult.upsertedCount} orders inserted` +
      (mode === 'refresh' ? `, ${customerResult.modifiedCount + orderResult.modifiedCount} refreshed.` : '.')
  );
}
