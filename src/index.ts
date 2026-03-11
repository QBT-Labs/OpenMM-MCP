#!/usr/bin/env node

// Handle setup command before importing heavy dependencies
if (process.argv[2] === 'setup') {
  import('./cli/setup.js');
} else {
  // Normal server startup
  import('./server.js');
}
