/**
 * Reown appkit-adapter-wagmi may nest @wagmi/connectors@8 (wagmi 3 line).
 * AppKit docs require wagmi 2.x — remove nested copy so resolution uses 6.2.0.
 */
const fs = require("fs");
const path = require("path");

const nested = path.join(
  __dirname,
  "..",
  "node_modules",
  "@reown",
  "appkit-adapter-wagmi",
  "node_modules",
  "@wagmi",
  "connectors",
);

if (fs.existsSync(nested)) {
  fs.rmSync(nested, { recursive: true, force: true });
  console.log(
    "[postinstall] removed nested @wagmi/connectors under appkit-adapter-wagmi",
  );
}
