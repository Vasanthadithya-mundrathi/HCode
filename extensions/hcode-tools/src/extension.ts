/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TOOLS } from './toolRegistry';
import { runTool, runToolHeadless, showInstallHint, ToolNode, ToolProvider } from './toolProvider';

/** Public API consumed by hcode-mcp-server and any AI agent extension */
export interface HCodeToolsAPI {
	/** Full tool registry */
	tools: typeof TOOLS;
	/** Run a tool headlessly: provide tool id and already-substituted arg string */
	runToolHeadless: (toolId: string, args: string) => vscode.Terminal;
	/** Populate and return the current availability map */
	refreshAvailability: () => Promise<Map<string, boolean>>;
	/** Check availability map (toolId → installed bool) */
	getAvailability: () => Map<string, boolean>;
}

export function activate(context: vscode.ExtensionContext): HCodeToolsAPI {
	const provider = new ToolProvider();
	void provider.ensureAvailabilityChecked();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hcode.tools.list', provider),
	);

	// ── Refresh ───────────────────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.tools.refresh', () => provider.refresh()),
	);

	// ── Run tool (from tree or command palette) ───────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.tools.run', async (node?: ToolNode) => {
			let toolId: string | undefined;

			if (node?.nodeData.kind === 'tool') {
				toolId = node.nodeData.toolId;
			} else {
				// Pick from full list in palette
				const items = TOOLS.map(t => ({
					label: t.name,
					description: t.description,
					detail: t.category,
					id: t.id,
				}));
				const pick = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select a security tool to run',
					matchOnDescription: true,
					matchOnDetail: true,
				});
				toolId = pick?.id;
			}

			if (!toolId) { return; }
			const tool = TOOLS.find(t => t.id === toolId);
			if (!tool) { return; }

			const available = provider.getAvailability();
			if (available.size > 0 && !available.get(toolId)) {
				await showInstallHint(tool);
				return;
			}
			await runTool(tool);
		}),
	);

	// ── Install missing tool ──────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.tools.install', async (node?: ToolNode) => {
			const toolId = node?.nodeData.kind === 'tool' ? node.nodeData.toolId : undefined;
			const tool = toolId ? TOOLS.find(t => t.id === toolId) : undefined;
			if (tool) {
				await showInstallHint(tool);
			}
		}),
	);

	// ── Check all tools availability ──────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.tools.checkAll', async () => {
			provider.refresh();
			vscode.window.showInformationMessage('HCode Tools: Checking tool availability…');
		}),
	);

	// Return public API for consumption by MCP server and AI agent extensions
	return {
		tools: TOOLS,
		runToolHeadless,
		refreshAvailability: () => provider.ensureAvailabilityChecked(),
		getAvailability: () => provider.getAvailability(),
	};
}

export function deactivate(): void { /* no-op */ }
