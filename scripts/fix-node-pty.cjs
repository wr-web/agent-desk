const fs = require("node:fs");
const path = require("node:path");

if (process.platform !== "win32") {
  const helper = path.join(
    __dirname,
    "..",
    "node_modules",
    "node-pty",
    "prebuilds",
    `${process.platform}-${process.arch}`,
    "spawn-helper",
  );
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}
