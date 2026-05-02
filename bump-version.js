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

function setFileVersion(filePath, version) {
  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
  content.version = version;

  if (content.packages?.[""]) {
    content.packages[""].version = version;
  }

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
}

const manifestPath = path.join(__dirname, "manifest.json");
const packagePath = path.join(__dirname, "package.json");
const packageLockPath = path.join(__dirname, "package-lock.json");

const newVersion = bumpFile(manifestPath);
setFileVersion(packagePath, newVersion);
setFileVersion(packageLockPath, newVersion);

console.log(
  `Version bumped to ${newVersion} in manifest.json, package.json, and package-lock.json`,
);
