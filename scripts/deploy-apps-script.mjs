import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const scriptId = "1x7qcqw5iTlolZAmX7GVSBEe72oHPnSTwvcMsSOs7JZP-XYCyJMVUtSGZ";
const deploymentId = "AKfycbxf-TfpLBOKIW2I1jCXKF8_6ejXmWEWvPGgAISbLGhAfr9teKlJRQsR5oUYfl5HAEC-0A";
const webappUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
const description = process.argv.slice(2).join(" ") || `ServiceOps auto deploy ${new Date().toISOString()}`;
const rootDir = "apps-script";
const overlayDir = join(".tmp", `apps-script-overlay-${Date.now()}`);

function run(command, args, options = {}) {
  const commandLine = [command, ...args].map(shellQuote).join(" ");
  const result = spawnSync(commandLine, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
    stdio: "pipe"
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed to start.\n${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.${output ? `\n${output}` : ""}`);
  }

  if (!options.capture && output.trim()) process.stdout.write(output);
  return output;
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

console.log(`Deploying Classic Fireplace ServiceOps to Apps Script ${scriptId}`);
preserveRemoteProjectFiles();
run("npx", ["-y", "@google/clasp", "push", "--force"]);

const versionOutput = run("npx", ["-y", "@google/clasp", "version", description], { capture: true });
const versionMatch = versionOutput.match(/Created version\s+(\d+)/i) || versionOutput.match(/Version\s+(\d+)/i) || versionOutput.match(/(\d+)/);
if (!versionMatch) {
  throw new Error(`Could not read Apps Script version number from clasp output:\n${versionOutput}`);
}

const versionNumber = versionMatch[1];
run("npx", [
  "-y",
  "@google/clasp",
  "redeploy",
  deploymentId,
  "-V",
  versionNumber,
  "-d",
  description
]);

console.log(`Apps Script deployment updated to version ${versionNumber}`);
console.log(webappUrl);

function preserveRemoteProjectFiles() {
  if (!existsSync(rootDir)) {
    throw new Error(`Apps Script root directory not found: ${rootDir}`);
  }

  rmSync(overlayDir, { recursive: true, force: true });
  mkdirSync(overlayDir, { recursive: true });
  cpSync(rootDir, overlayDir, { recursive: true });

  try {
    console.log("Pulling current Apps Script project before push so existing remote files are preserved.");
    run("npx", ["-y", "@google/clasp", "pull", "--force"]);
    cpSync(overlayDir, rootDir, { recursive: true });
  } finally {
    rmSync(overlayDir, { recursive: true, force: true });
  }
}
