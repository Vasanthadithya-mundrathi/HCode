/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const reconStateKey = 'hcode.recon.state';

interface ReconTarget {
	id: string;
	label: string;
	createdAt: string;
}

interface ReconScanResult {
	id: string;
	target: string;
	label: string;
	command: string;
	createdAt: string;
}

interface ReconState {
	targets: ReconTarget[];
	results: ReconScanResult[];
}

type ReconNodeData =
	| { kind: 'target'; targetId: string }
	| { kind: 'empty' };

class ReconNode extends vscode.TreeItem {
	constructor(
		readonly nodeData: ReconNodeData,
		label: string,
		state: vscode.TreeItemCollapsibleState,
	) {
		super(label, state);
	}
}

class ReconStore {
	private state: ReconState;
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChange = this.onDidChangeEmitter.event;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.state = context.globalState.get<ReconState>(reconStateKey) ?? { targets: [], results: [] };
	}

	getTargets(): ReconTarget[] {
		return this.state.targets;
	}

	getResults(): ReconScanResult[] {
		return [...this.state.results].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	}

	getTarget(targetId: string): ReconTarget | undefined {
		return this.state.targets.find(target => target.id === targetId);
	}

	async addTarget(label: string): Promise<ReconTarget> {
		const existing = this.state.targets.find(target => target.label === label);
		if (existing) {
			return existing;
		}

		const target: ReconTarget = {
			id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			label,
			createdAt: new Date().toISOString(),
		};
		this.state.targets.push(target);
		await this.save();
		return target;
	}

	async addResult(result: ReconScanResult): Promise<void> {
		this.state.results.unshift(result);
		this.state.results = this.state.results.slice(0, 50);
		await this.save();
	}

	async clearResults(): Promise<void> {
		this.state.results = [];
		await this.save();
	}

	private async save(): Promise<void> {
		await this.context.globalState.update(reconStateKey, this.state);
		this.onDidChangeEmitter.fire();
	}
}

class ReconTargetsProvider implements vscode.TreeDataProvider<ReconNode> {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ReconNode | undefined | void>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor(private readonly store: ReconStore) {
		store.onDidChange(() => this.onDidChangeTreeDataEmitter.fire());
	}

	getTreeItem(element: ReconNode): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ReconNode): ReconNode[] {
		if (element) {
			return [];
		}

		const targets = this.store.getTargets();
		if (!targets.length) {
			const empty = new ReconNode({ kind: 'empty' }, 'No recon targets yet', vscode.TreeItemCollapsibleState.None);
			empty.description = 'Use HCode Recon: New Scan';
			empty.iconPath = new vscode.ThemeIcon('dash');
			return [empty];
		}

		return targets.map(target => {
			const node = new ReconNode({ kind: 'target', targetId: target.id }, target.label, vscode.TreeItemCollapsibleState.None);
			node.description = 'Tracked target';
			node.iconPath = new vscode.ThemeIcon('target');
			return node;
		});
	}
}

class ReconResultsViewProvider implements vscode.WebviewViewProvider {
	static readonly viewId = 'hcode.recon.results';

	private view: vscode.WebviewView | undefined;

	constructor(private readonly store: ReconStore) {
		store.onDidChange(() => void this.render());
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = { enableScripts: false };
		void this.render();
	}

	private async render(): Promise<void> {
		if (!this.view) {
			return;
		}

		const nonce = getNonce();
		const items = this.store.getResults().map(result => `
			<li>
				<h3>${escapeHtml(result.label)}</h3>
				<p><strong>Target:</strong> ${escapeHtml(result.target)}</p>
				<p><strong>Time:</strong> ${escapeHtml(new Date(result.createdAt).toLocaleString())}</p>
				<pre>${escapeHtml(result.command)}</pre>
			</li>`).join('');

		this.view.webview.html = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>HCode Recon Results</title>
			<style nonce="${nonce}">
				body { margin: 0; padding: 16px; background: #081018; color: #e8f4ff; font-family: var(--vscode-font-family); }
				h2 { margin-top: 0; }
				ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
				li { border: 1px solid #223242; border-radius: 12px; padding: 12px; background: #0d1620; }
				p { color: #9fb3c7; }
				pre { white-space: pre-wrap; word-break: break-word; background: #060c12; color: #d8f2ff; border-radius: 8px; padding: 10px; }
			</style>
		</head>
		<body>
			<h2>Recent Recon Activity</h2>
			${items ? `<ul>${items}</ul>` : '<p>No recon commands have been run yet.</p>'}
		</body>
		</html>`;
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const store = new ReconStore(context);
	const targetsProvider = new ReconTargetsProvider(store);
	const resultsProvider = new ReconResultsViewProvider(store);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hcode.recon.targets', targetsProvider),
		vscode.window.registerWebviewViewProvider(ReconResultsViewProvider.viewId, resultsProvider),
		vscode.commands.registerCommand('hcode.recon.newScan', async () => {
			const target = await promptForTarget(store);
			if (!target) {
				return;
			}
			await runReconCommand(store, 'Quick Nmap Scan', target.label, `nmap -sV -T4 ${shellEscape(target.label)}`);
		}),
		vscode.commands.registerCommand('hcode.recon.nmapQuick', async () => {
			const target = await promptForTarget(store);
			if (target) {
				await runReconCommand(store, 'Quick Nmap Scan', target.label, `nmap -sV -T4 ${shellEscape(target.label)}`);
			}
		}),
		vscode.commands.registerCommand('hcode.recon.nmapFull', async () => {
			const target = await promptForTarget(store);
			if (target) {
				await runReconCommand(store, 'Full Nmap Scan', target.label, `nmap -sV -T4 -p- ${shellEscape(target.label)}`);
			}
		}),
		vscode.commands.registerCommand('hcode.recon.nmapService', async () => {
			const target = await promptForTarget(store);
			if (target) {
				await runReconCommand(store, 'Nmap Service Scan', target.label, `nmap -sC -sV ${shellEscape(target.label)}`);
			}
		}),
		vscode.commands.registerCommand('hcode.recon.subdomain', async () => {
			const target = await promptForTarget(store);
			if (target) {
				await runReconCommand(store, 'Subdomain Enumeration', target.label, `subfinder -d ${shellEscape(target.label)} -all -silent`);
			}
		}),
		vscode.commands.registerCommand('hcode.recon.whois', async () => {
			const target = await promptForTarget(store);
			if (target) {
				await runReconCommand(store, 'WHOIS Lookup', target.label, `whois ${shellEscape(target.label)}`);
			}
		}),
		vscode.commands.registerCommand('hcode.recon.clearResults', async () => {
			await store.clearResults();
			vscode.window.showInformationMessage('HCode Recon results cleared.');
		}),
	);
}

export function deactivate(): void {
	// no-op
}

async function promptForTarget(store: ReconStore): Promise<ReconTarget | undefined> {
	const existingTargets = store.getTargets();
	interface TargetPick extends vscode.QuickPickItem {
		target?: ReconTarget;
	}

	const picks: TargetPick[] = existingTargets.map(target => ({ label: target.label, target }));
	const createNew: TargetPick = { label: 'Enter a New Target...' };
	const selected = await vscode.window.showQuickPick<TargetPick>([...picks, createNew], { placeHolder: 'Select or enter a recon target' });
	if (!selected) {
		return undefined;
	}

	if (selected.target) {
		return selected.target;
	}

	const value = await vscode.window.showInputBox({
		prompt: 'Enter a host, domain, URL, or CIDR target',
		ignoreFocusOut: true,
		validateInput: input => input.trim() ? undefined : 'Target is required'
	});
	if (!value) {
		return undefined;
	}

	return store.addTarget(value.trim());
}

async function runReconCommand(store: ReconStore, label: string, target: string, command: string): Promise<void> {
	const terminal = vscode.window.createTerminal({ name: `HCode Recon: ${label}` });
	terminal.show(true);
	terminal.sendText(command);

	await store.addResult({
		id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
		target,
		label,
		command,
		createdAt: new Date().toISOString(),
	});
}

function shellEscape(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getNonce(): string {
	const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return nonce;
}
