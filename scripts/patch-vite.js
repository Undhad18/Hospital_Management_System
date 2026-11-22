const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const apps = ['super-admin', 'hospital-admin', 'doctor', 'staff', 'patient'];

const comspecPatch = `if (process.platform === 'win32' && (!process.env.ComSpec || process.env.ComSpec.toLowerCase().includes('system32\\\\cmd.exe'))) {\n  process.env.ComSpec = 'C:\\\\Windows\\\\SysWOW64\\\\cmd.exe';\n}\n`;

for (const app of apps) {
  const viteBin = path.join(rootDir, 'apps', app, 'node_modules', 'vite', 'bin', 'vite.js');
  const viteChunk = path.join(rootDir, 'apps', app, 'node_modules', 'vite', 'dist', 'node', 'chunks', 'node.js');

  // Patch bin/vite.js
  if (fs.existsSync(viteBin)) {
    let content = fs.readFileSync(viteBin, 'utf8');
    if (!content.includes('SysWOW64')) {
      content = content.replace(/^#!\/usr\/bin\/env node\r?\n/, `#!/usr/bin/env node\n${comspecPatch}`);
      fs.writeFileSync(viteBin, content, 'utf8');
      console.log(`[patch-vite] Patched ${app}/node_modules/vite/bin/vite.js`);
    }
  }

  // Patch chunks/node.js for safe exec("net use")
  if (fs.existsSync(viteChunk)) {
    let content = fs.readFileSync(viteChunk, 'utf8');
    if (content.includes('exec("net use"') && !content.includes('safeRealpathSync = fs.realpathSync.native;\n\t}')) {
      const target = '\texec("net use", { windowsHide: true }, (error, stdout) => {';
      const replacement = '\ttry {\n\t\texec("net use", { windowsHide: true }, (error, stdout) => {';
      if (content.includes(target) && !content.includes(replacement)) {
        content = content.replace(
          target,
          replacement
        ).replace(
          '\t\tif (windowsNetworkMap.size === 0) safeRealpathSync = fs.realpathSync.native;\n\t\telse safeRealpathSync = windowsMappedRealpathSync;\n\t});',
          '\t\tif (windowsNetworkMap.size === 0) safeRealpathSync = fs.realpathSync.native;\n\t\telse safeRealpathSync = windowsMappedRealpathSync;\n\t});\n\t} catch {\n\t\tsafeRealpathSync = fs.realpathSync.native;\n\t}'
        );
        fs.writeFileSync(viteChunk, content, 'utf8');
        console.log(`[patch-vite] Patched ${app}/node_modules/vite/dist/node/chunks/node.js`);
      }
    }
  }
}

console.log('[patch-vite] Vite patches successfully verified across all portals.');

