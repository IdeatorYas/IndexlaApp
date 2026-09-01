const fs = require("node:fs");
const {
  HARNESS_PORTS,
  PID_FILE,
  META_FILE,
  WEBSERVER_PID_FILE,
  WEBSERVER_META_FILE,
  isPortOpen,
} = require("./stable-club-harness-process.cjs");

async function main() {
  const label = process.argv[2] ?? "run";
  const openPorts = [];
  for (const port of HARNESS_PORTS) {
    if (await isPortOpen(port)) openPorts.push(port);
  }

  const pidExists = fs.existsSync(PID_FILE);
  const metaExists = fs.existsSync(META_FILE);
  const webPidExists = fs.existsSync(WEBSERVER_PID_FILE);
  const webMetaExists = fs.existsSync(WEBSERVER_META_FILE);
  const pidValue = pidExists ? fs.readFileSync(PID_FILE, "utf8").trim() : null;
  const metaValue = metaExists ? fs.readFileSync(META_FILE, "utf8").trim() : null;
  const webPidValue = webPidExists ? fs.readFileSync(WEBSERVER_PID_FILE, "utf8").trim() : null;
  const webMetaValue = webMetaExists ? fs.readFileSync(WEBSERVER_META_FILE, "utf8").trim() : null;

  const result = {
    label,
    openPorts,
    pidFile: pidExists ? "present" : "absent",
    metaFile: metaExists ? "present" : "absent",
    webServerPidFile: webPidExists ? "present" : "absent",
    webServerMetaFile: webMetaExists ? "present" : "absent",
    pidValue,
    metaValue,
    webPidValue,
    webMetaValue,
    pass:
      openPorts.length === 0 &&
      !pidExists &&
      !metaExists &&
      !webPidExists &&
      !webMetaExists,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
