typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { tmpdir } from 'os';
import { getRandomTestPath } from './testUtils.js';
import { Promises } from '../../node/pfs.js';
import { SnapshotContext, assertSnapshot } from '../common/snapshot.js';
import { URI } from '../../common/uri.js';
import * as path from 'path';
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

// Tests for snapshot are in Node so that we can use native FS operations to
// set up and validate things.
//
// Uses snapshots for testing snapshots. It's snapception!

suite('snapshot', () => {
	let testDir: string;

	// Ensure no disposables are leaked in the test suite
	ensureNoDisposablesAreLeakedInTestSuite();

	// Setup a temporary directory for each test
	setup(function () {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'snapshot');
		return fs.promises.mkdir(testDir, { recursive: true });
	});

	// Clean up the temporary directory after each test
	teardown(function () {
		return Promises.rm(testDir);
	});

	// Helper function to create a SnapshotContext with a custom snapshots directory
	const makeContext = (test: Partial<Mocha.Test> | undefined) => {
		return new class extends SnapshotContext {
			constructor() {
				super(test as Mocha.Test);
				this.snapshotsDir = URI.file(testDir);
			}
		};
	};

	// Helper function to print the directory tree and assert it against a snapshot
	const snapshotFileTree = async () => {
		let str = '';

		const printDir = async (dir: string, indent: number) => {
			const children = await Promises.readdir(dir);
			for (const child of children) {
				const p = path.join(dir, child);
				if ((await fs.promises.stat(p)).isFile()) {
					const content = await fs.promises.readFile(p, 'utf-8');
					str += `${' '.repeat(indent)}${child}:\n`;
					for (const line of content.split('\n')) {
						str += `${' '.repeat(indent + 2)}${line}\n`;
					}
				} else {
					str += `${' '.repeat(indent)}${child}/\n`;
					await printDir(p, indent + 2);
				}
			}
		};

		await printDir(testDir, 0);
		await assertSnapshot(str);
	};

	// Test case: Creates a snapshot and validates the file tree
	test('creates a snapshot', async () => {
		const ctx = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		await ctx.assert({ cool: true });
		await snapshotFileTree();
	});

	// Test case: Validates a snapshot by comparing it with an existing one
	test('validates a snapshot', async () => {
		const ctx1 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		await ctx1.assert({ cool: true });

		const ctx2 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		// Should pass:
		await ctx2.assert({ cool: true });

		const ctx3 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		// Should fail:
		await assertThrowsAsync(() => ctx3.assert({ cool: false }));
	});

	// Test case: Cleans up old snapshots and validates the remaining file tree
	test('cleans up old snapshots', async () => {
		const ctx1 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		await ctx1.assert({ cool: true });
		await ctx1.assert({ nifty: true });
		await ctx1.assert({ customName: 1 }, { name: 'thirdTest', extension: 'txt' });
		await ctx1.assert({ customName: 2 }, { name: 'fourthTest' });

		await snapshotFileTree();