#!/usr/bin/env node

// OpenMM SDK creates ./logs/ on import. Change cwd to a writable location
// so it works when launched from / (Claude Desktop's default).
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
const openmmHome = join(homedir(), '.openmm');
mkdirSync(openmmHome, { recursive: true });
process.chdir(openmmHome);

export { createServer } from './server.js';

if (process.argv[2] === 'setup' || process.argv[2] === '--setup') {
  import('./cli/setup.js');
} else {
  import('./server.js');
}
