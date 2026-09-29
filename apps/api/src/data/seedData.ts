// Synthetic demo fixtures. Single source of truth for both the automatic
// startup seed and the manual `npm run seed` script.

export interface SeedCustomer {
  name: string;
  email: string;
  tier: 'standard' | 'premium';
}

export interface SeedOrder {
  orderNumber: string;
  customerEmail: string;
  itemName: string;
  total: number;
  daysAgo: number;
  isFinalSale: boolean;
}

const names = [
  'Ava Johnson', 'Liam Carter', 'Sophia Martinez', 'Noah Williams', 'Mia Thompson',
  'Ethan Brown', 'Isabella Davis', 'Lucas Wilson', 'Amelia Taylor', 'James Anderson',
  'Harper Thomas', 'Benjamin Moore', 'Evelyn Jackson', 'Henry White', 'Charlotte Harris'
];

export const seedCustomers: SeedCustomer[] = names.map((name, i) => ({
  name,
  email: `customer${i + 1}@example.com`,
  tier: i % 4 === 0 ? 'premium' : 'standard'
}));

const email = (n: number) => `customer${n}@example.com`;

// Each order's comment names the policy branch it is intended to exercise.
// `daysAgo` is resolved against the seed time, so boundary cases (29/31 days)
// drift as the database ages; re-run `npm run seed` to refresh dates.
export const seedOrders: SeedOrder[] = [
  { orderNumber: 'ORD-1001', customerEmail: email(1), itemName: 'Wireless Headphones', total: 89, daysAgo: 5, isFinalSale: false }, // damaged -> APPROVED
  { orderNumber: 'ORD-1016', customerEmail: email(1), itemName: 'Phone Case', total: 25, daysAgo: 12, isFinalSale: false }, // incorrect item -> APPROVED
  { orderNumber: 'ORD-1002', customerEmail: email(2), itemName: 'Running Shoes', total: 129, daysAgo: 10, isFinalSale: false }, // changed mind -> ESCALATED
  { orderNumber: 'ORD-1003', customerEmail: email(3), itemName: 'Mechanical Keyboard', total: 199, daysAgo: 18, isFinalSale: false },
  { orderNumber: 'ORD-1017', customerEmail: email(3), itemName: 'Desk Lamp', total: 45, daysAgo: 40, isFinalSale: false }, // outside window -> DENIED
  { orderNumber: 'ORD-1004', customerEmail: email(4), itemName: 'Smart Watch', total: 249, daysAgo: 35, isFinalSale: false }, // outside window -> DENIED
  { orderNumber: 'ORD-1005', customerEmail: email(5), itemName: 'Laptop Pro 14"', total: 799, daysAgo: 7, isFinalSale: false }, // > $500 -> ESCALATED
  { orderNumber: 'ORD-1006', customerEmail: email(6), itemName: 'Clearance Jacket', total: 149, daysAgo: 8, isFinalSale: true }, // final sale -> DENIED
  { orderNumber: 'ORD-1007', customerEmail: email(7), itemName: 'Bluetooth Speaker', total: 79, daysAgo: 3, isFinalSale: false }, // prompt injection -> ESCALATED
  { orderNumber: 'ORD-1018', customerEmail: email(7), itemName: 'Yoga Mat', total: 35, daysAgo: 20, isFinalSale: false },
  { orderNumber: 'ORD-1019', customerEmail: email(7), itemName: 'Coffee Grinder', total: 119, daysAgo: 60, isFinalSale: false }, // outside window -> DENIED
  { orderNumber: 'ORD-1008', customerEmail: email(8), itemName: 'Gaming Monitor', total: 500, daysAgo: 14, isFinalSale: false }, // exactly $500 -> not escalated for amount
  { orderNumber: 'ORD-1009', customerEmail: email(9), itemName: 'Tablet', total: 649, daysAgo: 45, isFinalSale: false }, // window denial beats > $500
  { orderNumber: 'ORD-1010', customerEmail: email(10), itemName: 'Espresso Machine', total: 529, daysAgo: 6, isFinalSale: true }, // final sale beats > $500
  { orderNumber: 'ORD-1011', customerEmail: email(11), itemName: 'Winter Boots', total: 159, daysAgo: 29, isFinalSale: false }, // just inside window
  { orderNumber: 'ORD-1020', customerEmail: email(11), itemName: 'Sunglasses', total: 95, daysAgo: 2, isFinalSale: false },
  { orderNumber: 'ORD-1012', customerEmail: email(12), itemName: 'Limited Sneakers', total: 110, daysAgo: 4, isFinalSale: true }, // final sale -> DENIED
  { orderNumber: 'ORD-1013', customerEmail: email(13), itemName: 'Air Purifier', total: 189, daysAgo: 11, isFinalSale: false }, // suspicious -> ESCALATED
  { orderNumber: 'ORD-1014', customerEmail: email(14), itemName: 'Camera Lens', total: 899, daysAgo: 16, isFinalSale: false }, // > $500 -> ESCALATED
  { orderNumber: 'ORD-1015', customerEmail: email(15), itemName: 'Blender', total: 69, daysAgo: 9, isFinalSale: false },
  { orderNumber: 'ORD-1021', customerEmail: email(15), itemName: 'Kitchen Knife Set', total: 139, daysAgo: 31, isFinalSale: false } // just outside window
];
