import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import path from 'path';

function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
}

mkdirSync('release', { recursive: true });

// 1. Build client
run('npm run build');

// 2. Bundle server
run('node scripts/build-server.mjs');

// 3. Package with pkg for Windows x64
// @yao-pkg/pkg reads pkg config from package.json
run('npx @yao-pkg/pkg build/server.cjs --targets node22-win-x64 --output release/arena-shooter-server.exe --config package.json');

// 4. Copy dist next to exe as fallback (also embedded, but handy)
if (existsSync('dist')) {
  const dest = path.join('release', 'dist');
  rmSync(dest, { recursive: true, force: true });
  cpSync('dist', dest, { recursive: true });
  console.log('Copied dist/ to release/dist/');
}

console.log('\nDone! Windows exe: release/arena-shooter-server.exe');
console.log('Run it on Windows, then open http://localhost:8080');
