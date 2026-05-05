require('dotenv').config();

const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

function findPkgs(rootDir) {
  if (!existsSync(rootDir)) {
    return [];
  }

  const pkgPaths = [];

  for (const entry of readdirSync(rootDir)) {
    const entryPath = path.join(rootDir, entry);
    const entryStat = statSync(entryPath);

    if (entryStat.isDirectory()) {
      pkgPaths.push(...findPkgs(entryPath));
      continue;
    }

    if (entry.endsWith('.pkg')) {
      pkgPaths.push(entryPath);
    }
  }

  return pkgPaths;
}

function getLatestPkg(rootDir) {
  const pkgPaths = findPkgs(rootDir).map((pkgPath) => ({
    pkgPath,
    modifiedAtMs: statSync(pkgPath).mtimeMs,
  }));

  if (pkgPaths.length === 0) {
    return { selectedPkg: undefined, pkgPaths };
  }

  pkgPaths.sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);

  return {
    selectedPkg: pkgPaths[0].pkgPath,
    pkgPaths,
  };
}

const requiredEnvVars = [
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const pkgArg = process.argv[2];
const pkgRootDir = path.resolve('out/mas/make');
const { selectedPkg, pkgPaths } = getLatestPkg(pkgRootDir);
const pkgPath = pkgArg ? path.resolve(pkgArg) : selectedPkg;

if (!pkgPath || !existsSync(pkgPath)) {
  console.error('No .pkg found under out/mas/make. Run npm run make:mas first or pass the pkg path as an argument.');
  process.exit(1);
}

if (!pkgArg && pkgPaths.length > 1) {
  console.warn('Multiple .pkg files found under out/mas/make; selecting the most recently modified one:');

  for (const { pkgPath: candidatePath, modifiedAtMs } of pkgPaths) {
    console.warn(`- ${candidatePath} (${new Date(modifiedAtMs).toLocaleString()})`);
  }
}

const pkgModifiedAt = statSync(pkgPath).mtime;
console.log(`Uploading pkg: ${pkgPath}`);
console.log(`Modified at: ${pkgModifiedAt.toLocaleString()}`);

const args = [
  'altool',
  '--upload-package',
  pkgPath,
  '-u',
  process.env.APPLE_ID,
  '-p',
  `@env:APPLE_APP_SPECIFIC_PASSWORD`,
  '--wait',
];

if (process.env.APPLE_PROVIDER_PUBLIC_ID) {
  args.push('--provider-public-id', process.env.APPLE_PROVIDER_PUBLIC_ID);
}

execFileSync('xcrun', args, {
  stdio: 'inherit',
  env: process.env,
});