#!/usr/bin/env bun

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bun provides import.meta.dir, but TypeScript doesn't know about it
// Use fileURLToPath as fallback for type safety
const __dirname = (import.meta as { dir?: string }).dir || dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

type CreateType = 'function' | 'package' | 'webapp' | 'service';

const validTypes = ['function', 'package', 'webapp', 'service'];

const type = process.argv[2] as CreateType;
const name = process.argv[3];

if (!type || !validTypes.includes(type)) {
  console.error('Usage: bun scripts/create.ts <function|package|webapp|service> <name>');
  process.exit(1);
}

if (!name) {
  console.error(`Usage: bun scripts/create.ts ${type} <name>`);
  process.exit(1);
}

// Determine target directory and template directory
const targetDirMap: Record<CreateType, string> = {
  function: 'functions',
  package: 'packages',
  webapp: 'webapps',
  service: 'services',
};

const typeLabelMap: Record<CreateType, string> = {
  function: 'Function',
  package: 'Package',
  webapp: 'Webapp (React)',
  service: 'Service (Elysia)',
};

const targetDir = join(rootDir, targetDirMap[type], name);
const templateDir = join(rootDir, 'templates', type);

if (existsSync(targetDir)) {
  console.error(`${typeLabelMap[type]} ${name} already exists!`);
  process.exit(1);
}

console.log(`Creating ${typeLabelMap[type]}: ${name}...`);

// Copy directory recursively (cross-platform)
function copyDir(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(templateDir, targetDir);

// Replace placeholders
function replaceInFile(filePath: string, replacements: Record<string, string>): void {
  let content = readFileSync(filePath, 'utf8');
  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  writeFileSync(filePath, content, 'utf8');
}

function pascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

const replacements: Record<string, string> = {
  '{{name}}': name,
};

if (type === 'function') {
  replacements['{{NamePascal}}'] = pascalCase(name);
}

// Replace in all files
function walkDir(dir: string): void {
  const files = readdirSync(dir);
  files.forEach((file) => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else {
      try {
        replaceInFile(filePath, replacements);
      } catch (err: unknown) {
        // Skip binary files
        if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`Warning: Could not process ${filePath}: ${err.message}`);
        }
      }
    }
  });
}

walkDir(targetDir);

// Type-specific post-processing
if (type === 'function') {
  console.log(`Function ${name} created successfully!`);
  console.log(`\nEach function has its own template.yaml that defines its SAM configuration.`);
  console.log(`The templates are merged automatically during 'bun run sam:build'.`);
  console.log(`\nNext steps:`);
  console.log(`  cd functions/${name}`);
  console.log(`  bun install`);
  console.log(`  bun run build  # Build the function before deploying`);
} else if (type === 'package') {
  console.log(`Package ${name} created successfully!`);
  console.log(`Next steps:`);
  console.log(`  cd packages/${name}`);
  console.log(`  bun install`);
} else if (type === 'webapp') {
  console.log(`Webapp (React) ${name} created successfully!`);
  console.log(`Next steps:`);
  console.log(`  cd webapps/${name}`);
  console.log(`  bun install`);
  console.log(`  bun run dev`);
} else if (type === 'service') {
  console.log(`Service (Elysia) ${name} created successfully!`);
  console.log(`Next steps:`);
  console.log(`  cd services/${name}`);
  console.log(`  bun install`);
  console.log(`  bun run dev`);
}
