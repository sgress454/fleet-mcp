#!/usr/bin/env node

// This is a helper script to run TypeScript files in ESM mode
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the TypeScript file to run from the command line arguments
const tsFile = process.argv[2];

if (!tsFile) {
  console.error('Please provide a TypeScript file to run');
  process.exit(1);
}

// Run the TypeScript file using ts-node
const result = spawnSync('npx', ['ts-node', '--transpile-only', tsFile], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

// Exit with the same code as the ts-node process
process.exit(result.status);