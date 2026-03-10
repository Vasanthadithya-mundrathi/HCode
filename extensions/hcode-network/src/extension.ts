/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const networkHistoryKey = 'hcode.network.history';

interface HistoryEntry {
	id: string;
	method: string;
	url: string;
	status: number;
	createdAt: string;
}

class NetworkHistoryStore {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChange = this.onDidChangeEmitter.event;

	constructor(private readonly context: vscode.ExtensionContext) { }

	getEntries(): HistoryEntry[] {
		const entries = this.context.workspaceState.get<HistoryEntry[]>(networkHistoryKey, []);
		return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	}

	async addEntry(entry: HistoryEntry): Promise<void> {
		const entries = this.getEntries();
		entries.unshift(entry);
		await this.context.workspaceState.update(networkHistoryKey, entries.slice(0, 50));
		this.onDidChangeEmitter.fire();
	}
}

type HistoryNodeData =
	| { kind: 'entry'; entryId: string }
	| { kind: 'empty' };

class HistoryNode extends vscode.TreeItem {
	constructor(readonly nodeData: HistoryNodeData, label: string, state: vscode.TreeItemCollapsibleState) {
		super(label, state);
	}
}

class NetworkHistoryProvider implements vscode.TreeDataProvider<HistoryNode> {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<HistoryNode | undefined | void>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor(private readonly store: NetworkHistoryStore) {
		store.onDidChange(() => this.onDidChangeTreeDataEmitter.fire());
	}

	getTreeItem(element: HistoryNode): vscode.TreeItem {
		return element;
	}

	getChildren(element?: HistoryNode): HistoryNode[] {
		if (element) {
			return [];
		}

		const entries = this.store.getEntries();
		if (!entries.length) {
			const empty = new HistoryNode({ kind: 'empty' }, 'No HTTP requests yet', vscode.TreeItemCollapsibleState.None);
			empty.description = 'Use HCode Network: Open HTTP Repeater';
			empty.iconPath = new vscode.ThemeIcon('dash');
			return [empty];
		}

		return entries.map(entry => {
			const node = new HistoryNode({ kind: 'entry', entryId: entry.id }, `${entry.method} ${entry.url}`, vscode.TreeItemCollapsibleState.None);
			node.description = `${entry.status} • ${new Date(entry.createdAt).toLocaleTimeString()}`;
			node.iconPath = new vscode.ThemeIcon(entry.status >= 400 ? 'error' : 'globe');
			return node;
		});
	}
}

class RepeaterViewProvider implements vscode.WebviewViewProvider {
	static readonly viewId = 'hcode.network.repeater';

	private view: vscode.WebviewView | undefined;

	constructor(private readonly store: NetworkHistoryStore) { }

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.onDidReceiveMessage(async message => {
			if (message.command === 'sendRequest') {
				await this.sendRequest(message);
			}
		});
		this.render();
	}

	render(): void {
		if (!this.view) {
			return;
		}

		const nonce = getNonce();
		const proxy = vscode.workspace.getConfiguration('hcode.network').get<string>('proxy', '');
		const followRedirects = vscode.workspace.getConfiguration('hcode.network').get<boolean>('followRedirects', true);
		const sslVerify = vscode.workspace.getConfiguration('hcode.network').get<boolean>('sslVerify', true);
		this.view.webview.html = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>HCode HTTP Repeater</title>
			<style nonce="${nonce}">
				body { margin: 0; padding: 16px; background: #081018; color: #e8f4ff; font-family: var(--vscode-font-family); display: grid; gap: 12px; }
				input, textarea, select { width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid #223242; background: #0d1620; color: #e8f4ff; padding: 10px; font: inherit; }
				textarea { min-height: 100px; resize: vertical; }
				button { border: 0; border-radius: 10px; padding: 10px 12px; font: inherit; font-weight: 600; cursor: pointer; background: #2fd7a3; color: #061018; }
				pre { white-space: pre-wrap; word-break: break-word; background: #060c12; padding: 12px; border-radius: 10px; border: 1px solid #223242; }
				.meta { color: #9fb3c7; font-size: 12px; }
			</style>
		</head>
		<body>
			<select id="method">
				<option>GET</option>
				<option>POST</option>
				<option>PUT</option>
				<option>PATCH</option>
				<option>DELETE</option>
			</select>
			<input id="url" type="text" placeholder="https://target.example/api" />
			<textarea id="headers" placeholder="Header: Value"></textarea>
			<textarea id="body" placeholder="Optional request body"></textarea>
			<div class="meta">Proxy setting: ${escapeHtml(proxy || 'not configured')} • Redirects: ${followRedirects ? 'follow' : 'manual'} • SSL verify: ${sslVerify ? 'enabled' : 'disabled'}</div>
			<button id="send-request">Send Request</button>
			<pre id="response">No response yet.</pre>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();
				document.getElementById('send-request').addEventListener('click', () => {
					vscode.postMessage({
						command: 'sendRequest',
						method: document.getElementById('method').value,
						url: document.getElementById('url').value,
						headers: document.getElementById('headers').value,
						body: document.getElementById('body').value,
					});
				});
				window.addEventListener('message', event => {
					document.getElementById('response').textContent = event.data.response;
				});
			</script>
		</body>
		</html>`;
	}

	private async sendRequest(message: { method?: string; url?: string; headers?: string; body?: string }): Promise<void> {
		if (!this.view) {
			return;
		}

		const url = message.url?.trim();
		if (!url) {
			this.view.webview.postMessage({ response: 'URL is required.' });
			return;
		}

		try {
			const headers = parseHeaders(message.headers ?? '');
			const response = await fetch(url, {
				method: (message.method ?? 'GET').toUpperCase(),
				headers,
				body: message.body?.trim() ? message.body : undefined,
				redirect: vscode.workspace.getConfiguration('hcode.network').get<boolean>('followRedirects', true) ? 'follow' : 'manual',
			});

			const text = await response.text();
			await this.store.addEntry({
				id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
				method: (message.method ?? 'GET').toUpperCase(),
				url,
				status: response.status,
				createdAt: new Date().toISOString(),
			});

			this.view.webview.postMessage({
				response: [`HTTP ${response.status} ${response.statusText}`, '', text].join('\n')
			});
		} catch (error) {
			this.view.webview.postMessage({ response: `Request failed: ${error instanceof Error ? error.message : String(error)}` });
		}
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const store = new NetworkHistoryStore(context);
	const historyProvider = new NetworkHistoryProvider(store);
	const repeaterProvider = new RepeaterViewProvider(store);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hcode.network.history', historyProvider),
		vscode.window.registerWebviewViewProvider(RepeaterViewProvider.viewId, repeaterProvider),
		vscode.commands.registerCommand('hcode.network.openRepeater', async () => {
			await vscode.commands.executeCommand('workbench.view.extension.hcode-network');
		}),
		vscode.commands.registerCommand('hcode.network.setProxy', async () => {
			const proxy = await vscode.window.showInputBox({
				prompt: 'Set HTTP/HTTPS proxy URL',
				placeHolder: 'http://127.0.0.1:8080',
				ignoreFocusOut: true,
			});
			if (proxy === undefined) {
				return;
			}
			await vscode.workspace.getConfiguration('hcode.network').update('proxy', proxy.trim(), vscode.ConfigurationTarget.Global);
			repeaterProvider.render();
		}),
		vscode.commands.registerCommand('hcode.network.clearProxy', async () => {
			await vscode.workspace.getConfiguration('hcode.network').update('proxy', '', vscode.ConfigurationTarget.Global);
			repeaterProvider.render();
		}),
		vscode.commands.registerCommand('hcode.network.diffResponses', async () => {
			const first = await vscode.window.showInputBox({ prompt: 'Paste the first HTTP response', ignoreFocusOut: true });
			if (first === undefined) {
				return;
			}
			const second = await vscode.window.showInputBox({ prompt: 'Paste the second HTTP response', ignoreFocusOut: true });
			if (second === undefined) {
				return;
			}

			const left = await vscode.workspace.openTextDocument({ language: 'http', content: first });
			const right = await vscode.workspace.openTextDocument({ language: 'http', content: second });
			await vscode.commands.executeCommand('vscode.diff', left.uri, right.uri, 'HCode Network Response Diff');
		}),
	);
}

export function deactivate(): void {
	// no-op
}

function parseHeaders(input: string): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const line of input.split(/\r?\n/)) {
		const separatorIndex = line.indexOf(':');
		if (separatorIndex === -1) {
			continue;
		}
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (key) {
			headers[key] = value;
		}
	}
	return headers;
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