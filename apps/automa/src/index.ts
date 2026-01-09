#!/usr/bin/env bun
/**
 * Automa CLI - Entry Point
 */

import { createCli } from './cli';

const program = createCli();

program.parseAsync(process.argv).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
