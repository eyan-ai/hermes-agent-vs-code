const { runTests } = require("@vscode/test-electron");
const path = require("path");

async function main() {
  const extDir = path.join(__dirname, "..", "..");
  const testFile = path.join(__dirname, "smoke.test.js");
  const wsDir = path.join(__dirname, "workspace");

  // Point at the machine's real VS Code so the test runs against the exact
  // binary the user uses. Newer builds name the binary "Code", which the
  // downloaded-build path (expecting "Electron") can't handle on macOS.
  const vscodeExecutablePath = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";

  try {
    const code = await runTests({
      extensionDevelopmentPath: extDir,
      extensionTestsPath: testFile,
      vscodeExecutablePath,
      // Short absolute paths: the auto-generated ".vscode-test/user-data" under
      // the repo root exceeds the unix socket path limit (EINVAL).
      launchArgs: [
        wsDir,
        "--disable-workspace-trust",
        "--user-data-dir=/tmp/hermes-e2e-profile",
        "--extensions-dir=/tmp/hermes-e2e-extensions"
      ]
    });
    console.log("SMOKE_TEST_EXIT:", code);
    process.exit(code || 0);
  } catch (err) {
    console.error("SMOKE_TEST_FAILED:", err.message);
    process.exit(1);
  }
}

main();
