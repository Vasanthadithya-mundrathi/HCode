/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TOOLS } from './toolRegistry';
import { installToolOneClick, runTool, runToolHeadless, showInstallHint, ToolNode, ToolProvider } from './toolProvider';

const onboardingShownKey = 'hcode.onboarding.shown';

/** Public API consumed by hcode-mcp-server and any AI agent extension */
export interface HCodeToolsAPI {
	/** Full tool registry */
	tools: typeof TOOLS;
	/** Run a tool headlessly: provide tool id and already-substituted arg string */
	runToolHeadless: (toolId: string, args: string) => vscode.Terminal;
	/** Populate and return the current availability map */
	refreshAvailability: () => Promise<Map<string, boolean>>;
	/** Check availability map (toolId -> installed bool) */
	getAvailability: () => Map<string, boolean>;
	/** Install tool by id using one-click flow */
	installToolHeadless: (toolId: string) => Promise<vscode.Terminal>;
}

export function activate(context: vscode.ExtensionContext): HCodeToolsAPI {
	const provider = new ToolProvider();
	void provider.ensureAvailabilityChecked();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hcode.tools.list', provider),
	);

	// Refresh

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.tools.refresh', () => provider.refresh()),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.welcome.openGettingStarted', async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showInformationMessage('HCode: Open a workspace folder to view getting started documentation.');
				return;
			}

			const uri = vscode.Uri.joinPath(workspaceFolder.uri, 'docs', 'HCODE_GETTING_STARTED.md');
			const document = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(document, { preview: false });
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.welcome.openWalkthrough', async () => {
			await vscode.commands.executeCommand('workbench.action.openWalkthrough', 'hcode.hcode-tools#hcode.gettingStarted', false);
		}),
	);

	void showFirstRunOnboarding(context);

	// Run tool (from tree or command palette)

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
				const action = await vscode.window.showInformationMessage(
					`${tool.name} is not installed yet.`,
					'Install Now',
					'Show Install Command',
				);

				if (action === 'Install Now') {
					await installToolOneClick(tool, provider);
					return;
				}

				if (action === 'Show Install Command') {
					await showInstallHint(tool);
				}
				return;
			}
			await runTool(tool);
		}),
	);

	// Install missing tool

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.tools.install', async (node?: ToolNode) => {
			let toolId = node?.nodeData.kind === 'tool' ? node.nodeData.toolId : undefined;

			if (!toolId) {
				const items = TOOLS.map(t => ({
					label: t.name,
					description: t.description,
					detail: t.category,
					id: t.id,
				}));
				const pick = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select a security tool to install',
					matchOnDescription: true,
					matchOnDetail: true,
				});
				toolId = pick?.id;
			}

			const tool = toolId ? TOOLS.find(t => t.id === toolId) : undefined;
			if (tool) {
				await installToolOneClick(tool, provider);
			}
		}),
	);

	// Check all tools availability

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.tools.checkAll', async () => {
			provider.refresh();
			vscode.window.showInformationMessage('HCode Tools: Checking tool availability...');
		}),
	);

	// Return public API for consumption by MCP server and AI agent extensions
	return {
		tools: TOOLS,
		runToolHeadless,
		refreshAvailability: () => provider.ensureAvailabilityChecked(),
		getAvailability: () => provider.getAvailability(),
		installToolHeadless: async (toolId: string) => {
			const tool = TOOLS.find(candidate => candidate.id === toolId);
			if (!tool) {
				throw new Error(`HCode: Unknown tool id: ${toolId}`);
			}

			const terminal = await installToolOneClick(tool, provider, false);
			if (!terminal) {
				throw new Error(`HCode: No install command available for ${toolId}`);
			}

			return terminal;
		},
	};
}

export function deactivate(): void { /* no-op */ }

async function showFirstRunOnboarding(context: vscode.ExtensionContext): Promise<void> {
	if (context.globalState.get<boolean>(onboardingShownKey, false)) {
		return;
	}

	const workbenchConfig = vscode.workspace.getConfiguration('workbench');
	const currentTheme = workbenchConfig.get<string>('colorTheme');
	if (!currentTheme || currentTheme === 'Default Dark+') {
		await workbenchConfig.update('colorTheme', 'HCode Dark', vscode.ConfigurationTarget.Global);
	}

	await context.globalState.update(onboardingShownKey, true);
	await vscode.commands.executeCommand('hcode.welcome.openWalkthrough');
	const action = await vscode.window.showInformationMessage(
		'HCode is ready. Start with onboarding, tools, or device setup.',
		'Open Walkthrough',
		'Open Getting Started',
		'Run a Tool',
		'Quick Setup Device',
	);

	if (action === 'Open Walkthrough') {
		await vscode.commands.executeCommand('hcode.welcome.openWalkthrough');
		return;
	}

	if (action === 'Open Getting Started') {
		await vscode.commands.executeCommand('hcode.welcome.openGettingStarted');
		return;
	}

	if (action === 'Run a Tool') {
		await vscode.commands.executeCommand('hcode.tools.run');
		return;
	}

	if (action === 'Quick Setup Device') {
		await vscode.commands.executeCommand('hcode.devices.quickSetup');
	}
}
