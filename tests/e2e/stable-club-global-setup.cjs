const { execSync } = require("node:child_process");
const {
  appendStartupLogTail,
  readMeta,
  startHarnessHardhatNodeIfNeeded,
  stopHarnessHardhat,
} = require("./stable-club-harness-process.cjs");

module.exports = async function stableClubGlobalSetup() {
  let meta = null;
  try {
    meta = await startHarnessHardhatNodeIfNeeded();
    execSync("npx hardhat run scripts/stable-club/deploy-local.cjs --network localhost", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch (err) {
    const failure = err instanceof Error ? err : new Error(String(err));
    try {
      await stopHarnessHardhat(meta ?? readMeta());
    } catch (cleanupErr) {
      failure.message += `\n\nHarness cleanup after setup failure also failed:\n${
        cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      }`;
    }
    throw appendStartupLogTail(failure);
  }
};
