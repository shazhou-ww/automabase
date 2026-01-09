#!/usr/bin/env bun
/**
 * Post-build script to copy minimal package.json to dist directories
 * This prevents SAM from showing "package.json file not found" warnings
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dirname, "..");
const functionsDir = join(rootDir, "functions");

// Get all function directories
const functions = readdirSync(functionsDir).filter((name) => {
	const fullPath = join(functionsDir, name);
	return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "package.json"));
});

console.log(`Processing ${functions.length} function(s)...`);

for (const funcName of functions) {
	const funcDir = join(functionsDir, funcName);
	const distDir = join(funcDir, "dist");

	// Read the original package.json
	const pkgJsonPath = join(funcDir, "package.json");
	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

	// Create a minimal package.json for SAM (no dependencies since they're bundled)
	const minimalPkgJson = {
		name: pkgJson.name,
		version: pkgJson.version,
		description: pkgJson.description,
		main: "index.js",
		type: "commonjs",
	};

	// Ensure dist directory exists
	if (!existsSync(distDir)) {
		mkdirSync(distDir, { recursive: true });
		console.log(`  Created: ${distDir}`);
	}

	// Write minimal package.json to dist
	const distPkgJsonPath = join(distDir, "package.json");
	writeFileSync(distPkgJsonPath, JSON.stringify(minimalPkgJson, null, 2));
	console.log(`  Copied: functions/${funcName}/dist/package.json`);
}

console.log("Done!");
