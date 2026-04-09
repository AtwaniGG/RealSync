/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFiles: ["./tests/setup.js"],
  // Silence noisy console output from logger during tests
  silent: false,
  testTimeout: 10000,
  // Node 25+ requires this to avoid localStorage SecurityError in jest-environment-node
  testEnvironmentOptions: {
    customExportConditions: ["node", "node-addons"],
  },
};
