const { stopHarnessAll } = require("./stable-club-harness-process.cjs");

module.exports = async function stableClubGlobalTeardown() {
  await stopHarnessAll();
};
