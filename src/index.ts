#!/usr/bin/env node

// Export createServer for testing and programmatic use
export { createServer } from './server.js';

// Handle setup command before importing heavy dependencies
if (process.argv[2] === 'setup' || process.argv[2] === '--setup') {
  import('./cli/setup.js');
} else {
  // Normal server startup
  import('./server.js');
}
