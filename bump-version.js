const fs = require("fs");
const path = require("path");

function bumpFile(filePath) {
  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const versionParts = content.version.split(".").map(Number);

  versionParts[2] += 1;
  if (versionParts[2] >= 100) {
    versionParts[2] = 0;
    versionParts[1] += 1;
  }
  if (versionParts[1] >= 100) {
    versionParts[1] = 0;
    versionParts[0] += 1;
  }

  const newVersion = versionParts.join(".");
  content.version = newVersion;

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
  return newVersion;
}

const manifestPath = path.join(__dirname, "manifest.json");
const packagePath = path.join(__dirname, "package.json");

const newVersion = bumpFile(manifestPath);
bumpFile(packagePath);

console.log(
  `Version bumped to ${newVersion} in both manifest.json and package.json`,
);
