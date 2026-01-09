/**
 * Automa CLI Tests
 */

import { describe, expect, it } from "vitest";
import { createCli } from "./cli";

describe("Automa CLI", () => {
	it("should create CLI with all commands", () => {
		const program = createCli();

		expect(program.name()).toBe("automa");

		const commandNames = program.commands.map((cmd) => cmd.name());

		expect(commandNames).toContain("config");
		expect(commandNames).toContain("profile");
		expect(commandNames).toContain("admin");
		expect(commandNames).toContain("tenant");
		expect(commandNames).toContain("realm");
		expect(commandNames).toContain("automata");
		expect(commandNames).toContain("event");
		expect(commandNames).toContain("batch");
	});

	it("should have global options", () => {
		const program = createCli();

		const optionNames = program.options.map((opt) => opt.long);

		expect(optionNames).toContain("--output");
		expect(optionNames).toContain("--quiet");
		expect(optionNames).toContain("--verbose");
		expect(optionNames).toContain("--profile");
		expect(optionNames).toContain("--admin-url");
		expect(optionNames).toContain("--admin-key");
	});
});

describe("Config Manager", () => {
	// Config manager tests would go here
	// Skipped for now as they require file system mocking
	it.skip("should load and save config", () => {
		// TODO: Add tests with file system mocking
	});
});

describe("Profile Manager", () => {
	// Profile manager tests would go here
	// Skipped for now as they require file system mocking
	it.skip("should manage profiles", () => {
		// TODO: Add tests with file system mocking
	});
});
