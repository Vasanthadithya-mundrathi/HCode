/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { SecurityTool, ToolCategory, TOOLS } from './toolRegistry';
import { createInstallPlan, launchInstallTerminal } from './installer';

/** Map of toolId -> true (installed) | false (not found) */
type AvailabilityMap = Map<string, boolean>;

const commandLookupBinary = process.platform === 'win32' ? 'where' : 'which';

export class ToolProvider implements vscode.TreeDataProvider<ToolNode> {
	private readonly _onChange = new vscode.EventEmitter<ToolNode | undefined | void>();
	readonly onDidChangeTreeData = this._onChange.event;

	private _availability: AvailabilityMap = new Map();
	private _checkedOnce = false;
	private _availabilityCheckPromise: Promise<void> | undefined;

	constructor() { }

	refresh(): void {
		this._checkedOnce = false;
		this._availabilityCheckPromise = undefined;
		this._onChange.fire();
	}

	getTreeItem(e: ToolNode): vscode.TreeItem { return e; }

	getChildren(element?: ToolNode): ToolNode[] | Thenable<ToolNode[]> {
		if (!this._checkedOnce) {
			return this.ensureAvailabilityChecked().then(() => this._build(element));
		}
		return this._build(element);
	}

	ensureAvailabilityChecked(): Promise<AvailabilityMap> {
		if (this._checkedOnce) {
			return Promise.resolve(this._availability);
		}

		if (!this._availabilityCheckPromise) {
			this._availabilityCheckPromise = this._checkAll().then(() => {
				this._checkedOnce = true;
			});
		}

		return this._availabilityCheckPromise.then(() => this._availability);
	}

	private _build(element?: ToolNode): ToolNode[] {
		if (!element) { return this._categoryNodes(); }
		if (element.nodeData.kind === 'category') { return this._toolNodes(element.nodeData.category); }
		return [];
	}

	private _categoryNodes(): ToolNode[] {
		const categories: ToolCategory[] = [
			'recon', 'web', 'fuzzing', 'network', 'password', 'osint',
			'exploitation', 'post-exploitation', 'secrets', 'cloud', 'ctf-analysis',
		];
		const icons: Record<ToolCategory, string> = {
			recon: 'radio-tower', web: 'globe', fuzzing: 'symbol-misc',
			network: 'plug', password: 'lock', osint: 'search',
			exploitation: 'zap', 'post-exploitation': 'shield',
			secrets: 'key', cloud: 'cloud', 'ctf-analysis': 'beaker',
		};
		return categories
			.filter(cat => TOOLS.some(t => t.category === cat))
			.map(cat => {
				const toolsInCat = TOOLS.filter(t => t.category === cat);
				const available = toolsInCat.filter(t => this._availability.get(t.id));
				const node = new ToolNode(
					{ kind: 'category', category: cat },
					cat.charAt(0).toUpperCase() + cat.slice(1),
					vscode.TreeItemCollapsibleState.Collapsed,
				);
				node.description = `${available.length}/${toolsInCat.length} installed`;
				node.iconPath = new vscode.ThemeIcon(icons[cat] ?? 'tools');
				return node;
			});
	}

	private _toolNodes(category: ToolCategory): ToolNode[] {
		return TOOLS.filter(t => t.category === category).map(tool => {
			const installed = this._availability.get(tool.id) ?? false;
			const node = new ToolNode(
				{ kind: 'tool', toolId: tool.id },
				tool.name,
				vscode.TreeItemCollapsibleState.None,
			);
			node.description = tool.description;
			node.tooltip = new vscode.MarkdownString(
				`**${tool.name}** - ${tool.description}\n\n` +
				(installed ? 'Installed' : `Not found\n\n_Install: \`${tool.installHint}\`_`),
			);
			node.iconPath = new vscode.ThemeIcon(
				installed ? 'terminal' : 'close',
				new vscode.ThemeColor(installed ? 'testing.iconPassed' : 'testing.iconFailed'),
			);
			node.contextValue = installed ? 'hcode.tool.installed' : 'hcode.tool.missing';
			return node;
		});
	}

	private _checkAll(): Promise<void> {
		const checks = TOOLS.map(tool =>
			new Promise<void>(resolve => {
				execFile(commandLookupBinary, [tool.binary], (err: Error | null) => {
					this._availability.set(tool.id, !err);
					resolve();
				});
			}),
		);
		return Promise.all(checks).then(() => { });
	}

	getAvailability(): AvailabilityMap { return this._availability; }
}

// Tree node

type ToolNodeData =
	| { kind: 'category'; category: ToolCategory }
	| { kind: 'tool'; toolId: string };

export class ToolNode extends vscode.TreeItem {
	constructor(
		public readonly nodeData: ToolNodeData,
		label: string,
		state: vscode.TreeItemCollapsibleState,
	) {
		super(label, state);
	}
}

// Tool runner

export async function runTool(tool: SecurityTool): Promise<void> {
	// 1. Pick a preset or let user type custom args
	const presetItems = tool.presets.map(p => ({ label: p.label, description: p.description, args: p.args }));
	presetItems.push({ label: '$(pencil) Custom arguments...', description: 'Enter your own arguments', args: '__custom__' });

	const selected = await vscode.window.showQuickPick(presetItems, {
		placeHolder: `${tool.name} - choose a preset or enter custom args`,
		matchOnDescription: true,
	});
	if (!selected) { return; }

	let argsTemplate = selected.args;
	if (argsTemplate === '__custom__') {
		const custom = await vscode.window.showInputBox({ prompt: `${tool.name} arguments`, placeHolder: `e.g. -sV -T4 192.168.1.1` });
		if (!custom) { return; }
		argsTemplate = custom;
	}

	// 2. Substitute {target} if needed
	let args = argsTemplate;
	if (argsTemplate.includes('{target}')) {
		const target = await vscode.window.showInputBox({
			prompt: 'Target (host, IP, CIDR, URL, or hash file path)',
			placeHolder: 'e.g. 192.168.1.1  or  example.com  or  /path/to/hashes.txt',
			validateInput: (v: string) => v.trim() ? undefined : 'Required',
		});
		if (!target) { return; }
		args = argsTemplate.replace(/\{target\}/g, target.trim());
	}

	// 3. Run in integrated terminal
	const terminal = vscode.window.createTerminal({
		name: `HCode: ${tool.name}`,
		iconPath: new vscode.ThemeIcon('terminal'),
	});
	terminal.show(true);
	terminal.sendText(`${tool.binary} ${args}`);
}

export async function showInstallHint(tool: SecurityTool): Promise<void> {
	const action = await vscode.window.showInformationMessage(
		`${tool.name} is not installed.\n\nInstall: ${tool.installHint}`,
		'Copy Install Command', 'Dismiss',
	);
	if (action === 'Copy Install Command') {
		await vscode.env.clipboard.writeText(tool.installHint);
	}
}

export async function installToolOneClick(
	tool: SecurityTool,
	provider: ToolProvider,
	promptForConfirmation = true,
): Promise<vscode.Terminal | undefined> {
	const plan = createInstallPlan(tool);
	if (!plan) {
		await showInstallHint(tool);
		return undefined;
	}

	if (promptForConfirmation) {
		const action = await vscode.window.showInformationMessage(
			`Install ${tool.name} using:\n${plan.installCommand}`,
			{ modal: true },
			'Install',
		);
		if (action !== 'Install') {
			return undefined;
		}
	}

	const terminal = launchInstallTerminal(tool, plan);
	vscode.window.showInformationMessage(`HCode: Running one-click install for ${tool.name}.`);

	const closeListener = vscode.window.onDidCloseTerminal(closedTerminal => {
		if (closedTerminal !== terminal) {
			return;
		}

		closeListener.dispose();
		provider.refresh();
	});

	return terminal;
}

/**
 * Headless tool runner for AI agents - accepts structured args directly without any UI prompts.
 * @param toolId The tool id from TOOLS registry (e.g. 'nmap', 'sqlmap')
 * @param args Full argument string, with {target} already substituted
 * @returns The terminal that was opened
 */
export function runToolHeadless(toolId: string, args: string): vscode.Terminal {
	const tool = TOOLS.find(t => t.id === toolId);
	if (!tool) { throw new Error(`HCode: Unknown tool id: ${toolId}`); }
	const terminal = vscode.window.createTerminal({
		name: `HCode: ${tool.name}`,
		iconPath: new vscode.ThemeIcon('terminal'),
	});
	terminal.show(true);
	terminal.sendText(`${tool.binary} ${args}`);
	return terminal;
}
