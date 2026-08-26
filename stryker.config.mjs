export default {
  testRunner: 'vitest',
  mutate: ['observability.js'],
  reporters: ['clear-text', 'progress', 'html'],
  coverageAnalysis: 'perTest',
  thresholds: { high: 80, low: 60, break: 50 }
};
