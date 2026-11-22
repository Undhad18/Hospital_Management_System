const { execSync } = require('child_process');
const path = require('path');

// Ensure Windows processes use SysWOW64 cmd.exe to avoid antivirus EPERM restrictions on System32 cmd.exe
if (process.platform === 'win32' && (!process.env.ComSpec || process.env.ComSpec.toLowerCase().includes('system32\\cmd.exe'))) {
  process.env.ComSpec = 'C:\\Windows\\SysWOW64\\cmd.exe';
}

const apps = ['super-admin', 'hospital-admin', 'doctor', 'staff', 'patient'];
const rootDir = path.resolve(__dirname, '..');

console.log("================================================================================");
console.log("=== BUILDING ALL HOSPITAL MANAGEMENT SYSTEM FRONTEND APPLICATIONS ===");
console.log("================================================================================\n");

let hasErrors = false;

for (const app of apps) {
  const appDir = path.join(rootDir, 'apps', app);
  try {
    process.stdout.write(`Building ${app}... `);
    const start = Date.now();
    execSync('npm run build', { cwd: appDir, stdio: 'pipe' });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✓ Succeeded (${duration}s)`);
  } catch (err) {
    hasErrors = true;
    console.log(`✗ FAILED!`);
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
  }
}

if (hasErrors) {
  console.error('\nBuild completed with errors.');
  process.exit(1);
} else {
  console.log('\n✓ All 5 frontend applications built successfully.');
  process.exit(0);
}

