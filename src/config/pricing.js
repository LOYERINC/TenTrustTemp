// TODO: Confirm these placeholder prices, turnaround times, and included checks
// against the server-side screening packages before enabling live checkout.
export const tiers = [
  { id: 'basic', name: 'Identity check', price: 5000, turnaround: '5–10 minutes', description: 'Confirm who they are.', includes: ['Identity check (BVN/NIN match)', 'Phone verification'] },
  { id: 'standard', name: 'Standard', price: 10000, recommended: true, turnaround: '5–10 minutes', description: 'Identity plus proof of income and address.', includes: ['Everything in Identity check', 'Employment verification', 'Address verification'] },
  { id: 'complete', name: 'Complete', price: 15000, turnaround: '5–10 minutes', description: 'The full picture before you hand over the keys.', includes: ['Everything in Standard', 'Reference checks', 'Background check'] },
];

export const agentPacks = [
  { id: 'pack10', checks: 10, discountPercent: 10 },
  { id: 'pack25', checks: 25, discountPercent: 15 },
  { id: 'pack50', checks: 50, discountPercent: 20 },
];
