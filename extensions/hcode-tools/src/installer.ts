/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SecurityTool } from './toolRegistry';

export interface ToolInstallPlan {
	installCommand: string;
	verifyCommand: string;
}

export function createInstallPlan(tool: SecurityTool): ToolInstallPlan | undefined {
	const candidates = tool.installHint
		.split(/\s+OR\s+/i)
		.map(candidate => candidate.replace(/`/g, '').trim())
		.filter(Boolean);

	if (!candidates.length) {
		return undefined;
	}

	const installCommand = selectInstallCommand(candidates);
	if (!installCommand) {
		return undefined;
	}

	const verifyCommand = process.platform === 'win32'
		? `where ${tool.binary} >NUL 2>&1`
		: `command -v ${tool.binary} >/dev/null 2>&1`;

	return { installCommand, verifyCommand };
}

export function launchInstallTerminal(tool: SecurityTool, plan: ToolInstallPlan): vscode.Terminal {
	const terminal = vscode.window.createTerminal({
		name: `HCode Install: ${tool.name}`,
		iconPath: new vscode.ThemeIcon('package'),
	});

	const lines: string[] = [
		`echo "HCode: Installing ${escapeDoubleQuotes(tool.name)}..."`,
		plan.installCommand,
		`if ${plan.verifyCommand}; then echo "HCode: ${escapeDoubleQuotes(tool.name)} installed successfully."; else echo "HCode: Installation completed but verification failed for ${escapeDoubleQuotes(tool.binary)}."; fi`,
	];

	terminal.show(true);
	for (const line of lines) {
		terminal.sendText(line, true);
	}

	return terminal;
}

function selectInstallCommand(candidates: string[]): string | undefined {
	if (process.platform === 'darwin') {
		return normalizeInstallCommand(firstMatching(candidates, candidate => candidate.includes('brew ')) ?? candidates[0]);
	}

	if (process.platform === 'win32') {
		return normalizeInstallCommand(firstMatching(candidates, candidate => candidate.includes('winget ') || candidate.includes('choco ')) ?? candidates[0]);
	}

	return normalizeInstallCommand(
		firstMatching(candidates, candidate => candidate.includes('apt ') || candidate.includes('apt-get '))
		?? candidates[0],
	);
}

function normalizeInstallCommand(command: string): string {
	if (/^sudo\s+apt(-get)?\s+install\s+/i.test(command) && !/\s-y(\s|$)/.test(command)) {
		return command.replace(/^(sudo\s+apt(?:-get)?\s+install\s+)/i, '$1-y ');
	}

	if (/^apt(-get)?\s+install\s+/i.test(command) && !/\s-y(\s|$)/.test(command)) {
		return command.replace(/^(apt(?:-get)?\s+install\s+)/i, '$1-y ');
	}

	return command;
}

function firstMatching(candidates: string[], predicate: (candidate: string) => boolean): string | undefined {
	for (const candidate of candidates) {
		if (predicate(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

function escapeDoubleQuotes(value: string): string {
	return value.replace(/"/g, '\\"');
}
