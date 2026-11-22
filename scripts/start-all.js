const { spawn } = require('child_process');
const path = require('path');

// Ensure Windows processes use SysWOW64 cmd.exe to avoid antivirus EPERM restrictions on System32 cmd.exe
if (process.platform === 'win32' && (!process.env.ComSpec || process.env.ComSpec.toLowerCase().includes('system32\\cmd.exe'))) {
  process.env.ComSpec = 'C:\\Windows\\SysWOW64\\cmd.exe';
}

const rootDir = path.resolve(__dirname, '..');

const processes = [
  { name: 'BACKEND', dir: path.join(rootDir, 'backend'), cmd: 'npm', args: ['run', 'dev'], port: 5000 },
  { name: 'SUPER-ADMIN', dir: path.join(rootDir, 'apps', 'super-admin'), cmd: 'npm', args: ['run', 'dev'], port: 5173 },
  { name: 'HOSPITAL-ADMIN', dir: path.join(rootDir, 'apps', 'hospital-admin'), cmd: 'npm', args: ['run', 'dev'], port: 5174 },
  { name: 'DOCTOR', dir: path.join(rootDir, 'apps', 'doctor'), cmd: 'npm', args: ['run', 'dev'], port: 5175 },
  { name: 'STAFF', dir: path.join(rootDir, 'apps', 'staff'), cmd: 'npm', args: ['run', 'dev'], port: 5176 },
  { name: 'PATIENT', dir: path.join(rootDir, 'apps', 'patient'), cmd: 'npm', args: ['run', 'dev'], port: 5177 }
];

console.log("================================================================================");
console.log("=== STARTING HOSPITAL MANAGEMENT SYSTEM MULTI-PORTAL ENVIRONMENT ===");
console.log("================================================================================\n");

processes.forEach(p => {
  console.log(`Starting [${p.name}] on port ${p.port}...`);
  const child = spawn(p.cmd, p.args, {
    cwd: p.dir,
    shell: true,
    stdio: 'inherit'
  });

  child.on('error', (err) => {
    console.error(`[${p.name}] Process error:`, err);
  });
});

console.log('\nAll application panels launched. Press Ctrl+C to terminate all services.');

