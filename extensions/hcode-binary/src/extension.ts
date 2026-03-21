/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { promises as fs } from 'fs';

const supportedExtensions = new Set(['.bin', '.exe', '.elf', '.so', '.dll', '.o', '.out']);
const maxHexPreviewBytes = 4096;
const maxStringItems = 100;

interface BinarySummary {
	readonly label: string;
	readonly description: string;
}

interface ParsedHeaderInfo {
	readonly fileType: string;
	readonly details: BinarySummary[];
}

type BinaryNodeData =
	| { readonly kind: 'value'; readonly value: string }
	| { readonly kind: 'empty' };

class BinaryNode extends vscode.TreeItem {
	constructor(readonly nodeData: BinaryNodeData, label: string, state: vscode.TreeItemCollapsibleState) {
		super(label, state);
	}
}

class ActiveBinaryModel {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChange = this.onDidChangeEmitter.event;

	private activeUri: vscode.Uri | undefined;

	setActiveUri(uri: vscode.Uri | undefined): void {
		const nextUri = uri && isSupportedBinaryUri(uri) ? uri : undefined;
		if (this.activeUri?.toString() === nextUri?.toString()) {
			return;
		}

		this.activeUri = nextUri;
		this.onDidChangeEmitter.fire();
	}

	getActiveUri(): vscode.Uri | undefined {
		return this.activeUri;
	}
}

class BinaryInfoProvider implements vscode.TreeDataProvider<BinaryNode> {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BinaryNode | undefined | void>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor(private readonly model: ActiveBinaryModel) {
		model.onDidChange(() => this.onDidChangeTreeDataEmitter.fire());
	}

	getTreeItem(element: BinaryNode): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: BinaryNode): Promise<BinaryNode[]> {
		if (element) {
			return [];
		}

		const uri = this.model.getActiveUri();
		if (!uri) {
			return [createEmptyNode('Open a supported binary file to inspect it.')];
		}

		const details = await getBinaryDetails(uri);
		return details.map(detail => {
			const node = new BinaryNode({ kind: 'value', value: detail.description }, detail.label, vscode.TreeItemCollapsibleState.None);
			node.description = detail.description;
			node.tooltip = `${detail.label}: ${detail.description}`;
			return node;
		});
	}
}

class BinaryStringsProvider implements vscode.TreeDataProvider<BinaryNode> {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BinaryNode | undefined | void>();
	readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	constructor(private readonly model: ActiveBinaryModel) {
		model.onDidChange(() => this.onDidChangeTreeDataEmitter.fire());
	}

	getTreeItem(element: BinaryNode): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: BinaryNode): Promise<BinaryNode[]> {
		if (element) {
			return [];
		}

		const uri = this.model.getActiveUri();
		if (!uri) {
			return [createEmptyNode('Open a supported binary file to extract strings.')];
		}

		const buffer = await fs.readFile(uri.fsPath);
		const strings = extractAsciiStrings(buffer).slice(0, maxStringItems);
		if (!strings.length) {
			return [createEmptyNode('No printable strings found.')];
		}

		return strings.map(value => {
			const node = new BinaryNode({ kind: 'value', value }, value, vscode.TreeItemCollapsibleState.None);
			node.tooltip = value;
			return node;
		});
	}
}

class HexViewerProvider implements vscode.CustomReadonlyEditorProvider {
	public static readonly viewType = 'hcode.hexEditor';

	async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => undefined };
	}

	async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
		const buffer = await fs.readFile(document.uri.fsPath);
		webviewPanel.webview.options = { enableScripts: false };
		webviewPanel.webview.html = renderHexViewerHtml(document.uri, buffer);
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const model = new ActiveBinaryModel();
	const infoProvider = new BinaryInfoProvider(model);
	const stringsProvider = new BinaryStringsProvider(model);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hcode.binary.info', infoProvider),
		vscode.window.registerTreeDataProvider('hcode.binary.strings', stringsProvider),
		vscode.window.registerCustomEditorProvider(HexViewerProvider.viewType, new HexViewerProvider(), {
			supportsMultipleEditorsPerDocument: true,
			webviewOptions: { retainContextWhenHidden: true }
		}),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			model.setActiveUri(editor?.document.uri);
		}),
		vscode.commands.registerCommand('hcode.binary.openHex', async (resource?: vscode.Uri) => {
			const uri = await resolveBinaryUri(resource);
			if (!uri) {
				return;
			}

			model.setActiveUri(uri);
			await vscode.commands.executeCommand('vscode.openWith', uri, HexViewerProvider.viewType);
		}),
		vscode.commands.registerCommand('hcode.binary.parseHeaders', async (resource?: vscode.Uri) => {
			const uri = await resolveBinaryUri(resource);
			if (!uri) {
				return;
			}

			model.setActiveUri(uri);
			await openMarkdownDocument(`HCode Binary Header Report: ${vscode.workspace.asRelativePath(uri) || uri.fsPath}`, renderHeaderReport(uri));
		}),
		vscode.commands.registerCommand('hcode.binary.entropy', async (resource?: vscode.Uri) => {
			const uri = await resolveBinaryUri(resource);
			if (!uri) {
				return;
			}

			model.setActiveUri(uri);
			await openMarkdownDocument(`HCode Binary Entropy: ${vscode.workspace.asRelativePath(uri) || uri.fsPath}`, renderEntropyReport(uri));
		}),
		vscode.commands.registerCommand('hcode.binary.strings', async (resource?: vscode.Uri) => {
			const uri = await resolveBinaryUri(resource);
			if (!uri) {
				return;
			}

			model.setActiveUri(uri);
			const buffer = await fs.readFile(uri.fsPath);
			const document = await vscode.workspace.openTextDocument({
				language: 'text',
				content: extractAsciiStrings(buffer).join('\n') || 'No printable strings found.'
			});
			await vscode.window.showTextDocument(document, { preview: false });
		})
	);

	model.setActiveUri(vscode.window.activeTextEditor?.document.uri);
}

export function deactivate(): void {
	// no-op
}

async function getBinaryDetails(uri: vscode.Uri): Promise<BinarySummary[]> {
	const buffer = await fs.readFile(uri.fsPath);
	const stats = await fs.stat(uri.fsPath);
	const headerInfo = parseHeaderInfo(buffer);
	const machine = headerInfo.details.find(detail => detail.label === 'Machine')?.description ?? 'Unknown';

	return [
		{ label: 'Path', description: vscode.workspace.asRelativePath(uri, false) || uri.fsPath },
		{ label: 'Type', description: headerInfo.fileType },
		{ label: 'Machine', description: machine },
		{ label: 'Size', description: `${stats.size.toLocaleString()} bytes` },
		{ label: 'Entropy', description: computeEntropy(buffer).toFixed(3) },
		...headerInfo.details.filter(detail => detail.label !== 'Machine')
	];
}

async function resolveBinaryUri(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
	const directUri = resource ?? vscode.window.activeTextEditor?.document.uri;
	if (directUri && isSupportedBinaryUri(directUri)) {
		return directUri;
	}

	const picks = (vscode.workspace.workspaceFolders ?? []).flatMap(folder =>
		vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.{bin,exe,elf,so,dll,o,out}'), '**/node_modules/**', 20)
	);
	const uris = await Promise.all(picks);
	const flattenedUris = uris.flat();
	if (!flattenedUris.length) {
		void vscode.window.showWarningMessage('HCode Binary: no supported binary files were found in the workspace.');
		return undefined;
	}

	const pick = await vscode.window.showQuickPick(flattenedUris.map(uri => ({
		label: vscode.workspace.asRelativePath(uri, false) || uri.fsPath,
		uri
	})), { placeHolder: 'Select a binary file' });

	return pick?.uri;
}

function isSupportedBinaryUri(uri: vscode.Uri): boolean {
	return uri.scheme === 'file' && supportedExtensions.has(extensionOf(uri.fsPath));
}

function extensionOf(path: string): string {
	const lastDot = path.lastIndexOf('.');
	return lastDot === -1 ? '' : path.slice(lastDot).toLowerCase();
}

function createEmptyNode(label: string): BinaryNode {
	const node = new BinaryNode({ kind: 'empty' }, label, vscode.TreeItemCollapsibleState.None);
	node.iconPath = new vscode.ThemeIcon('dash');
	return node;
}

async function openMarkdownDocument(title: string, contentPromise: Promise<string>): Promise<void> {
	const content = await contentPromise;
	const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: `# ${title}\n\n${content}` });
	await vscode.window.showTextDocument(document, { preview: false });
}

async function renderHeaderReport(uri: vscode.Uri): Promise<string> {
	const buffer = await fs.readFile(uri.fsPath);
	const headerInfo = parseHeaderInfo(buffer);
	return [
		`- File: ${vscode.workspace.asRelativePath(uri, false) || uri.fsPath}`,
		`- Type: ${headerInfo.fileType}`,
		...headerInfo.details.map(detail => `- ${detail.label}: ${detail.description}`)
	].join('\n');
}

async function renderEntropyReport(uri: vscode.Uri): Promise<string> {
	const buffer = await fs.readFile(uri.fsPath);
	const chunkSize = 256;
	const lines = [`- File: ${vscode.workspace.asRelativePath(uri, false) || uri.fsPath}`, `- Overall Entropy: ${computeEntropy(buffer).toFixed(3)}`, '', '| Chunk | Entropy |', '| --- | --- |'];

	for (let offset = 0; offset < buffer.length; offset += chunkSize) {
		const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
		lines.push(`| 0x${offset.toString(16).padStart(6, '0')} | ${computeEntropy(chunk).toFixed(3)} |`);
		if (lines.length > 34) {
			lines.push('| ... | ... |');
			break;
		}
	}

	return lines.join('\n');
}

function parseHeaderInfo(buffer: Buffer): ParsedHeaderInfo {
	if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
		const bitness = buffer[4] === 2 ? '64-bit' : '32-bit';
		const endianness = buffer[5] === 2 ? 'Big-endian' : 'Little-endian';
		const machine = readElfMachine(buffer.readUInt16LE(18));
		return {
			fileType: 'ELF',
			details: [
				{ label: 'Bitness', description: bitness },
				{ label: 'Endianness', description: endianness },
				{ label: 'Machine', description: machine }
			]
		};
	}

	if (buffer.length >= 64 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
		const peOffset = buffer.readUInt32LE(0x3c);
		if (peOffset + 6 < buffer.length && buffer.toString('ascii', peOffset, peOffset + 4) === 'PE\0\0') {
			const machineCode = buffer.readUInt16LE(peOffset + 4);
			const sectionCount = buffer.readUInt16LE(peOffset + 6);
			return {
				fileType: 'Portable Executable',
				details: [
					{ label: 'Machine', description: readPeMachine(machineCode) },
					{ label: 'Sections', description: sectionCount.toString() },
					{ label: 'PE Header Offset', description: `0x${peOffset.toString(16)}` }
				]
			};
		}

		return {
			fileType: 'DOS MZ executable',
			details: [{ label: 'Machine', description: 'DOS' }]
		};
	}

	return {
		fileType: 'Unknown Binary',
		details: [{ label: 'Machine', description: 'Unknown' }]
	};
}

function readElfMachine(machine: number): string {
	switch (machine) {
		case 0x03: return 'x86';
		case 0x3e: return 'x86_64';
		case 0x28: return 'ARM';
		case 0xb7: return 'AArch64';
		default: return `Unknown (0x${machine.toString(16)})`;
	}
}

function readPeMachine(machine: number): string {
	switch (machine) {
		case 0x014c: return 'x86';
		case 0x8664: return 'x86_64';
		case 0x01c0: return 'ARM';
		case 0xaa64: return 'ARM64';
		default: return `Unknown (0x${machine.toString(16)})`;
	}
}

function computeEntropy(buffer: Buffer): number {
	if (!buffer.length) {
		return 0;
	}

	const frequencies = new Array<number>(256).fill(0);
	for (const value of buffer) {
		frequencies[value]++;
	}

	let entropy = 0;
	for (const count of frequencies) {
		if (!count) {
			continue;
		}

		const probability = count / buffer.length;
		entropy -= probability * Math.log2(probability);
	}

	return entropy;
}

function extractAsciiStrings(buffer: Buffer): string[] {
	const text = Array.from(buffer, value => value >= 32 && value <= 126 ? String.fromCharCode(value) : '\n').join('');
	return text.split(/\n+/).filter(segment => segment.length >= 4);
}

function renderHexViewerHtml(uri: vscode.Uri, buffer: Buffer): string {
	const nonce = getNonce();
	const displayBuffer = buffer.subarray(0, Math.min(buffer.length, maxHexPreviewBytes));
	const rows: string[] = [];
	for (let offset = 0; offset < displayBuffer.length; offset += 16) {
		const row = displayBuffer.subarray(offset, Math.min(offset + 16, displayBuffer.length));
		const hex = Array.from(row, value => value.toString(16).padStart(2, '0')).join(' ');
		const ascii = Array.from(row, value => value >= 32 && value <= 126 ? String.fromCharCode(value) : '.').join('');
		rows.push(`<tr><td>0x${offset.toString(16).padStart(6, '0')}</td><td>${hex.padEnd(47, ' ')}</td><td>${escapeHtml(ascii)}</td></tr>`);
	}

	const truncatedNotice = buffer.length > maxHexPreviewBytes
		? `<p>Preview truncated to the first ${maxHexPreviewBytes.toLocaleString()} bytes of ${buffer.length.toLocaleString()}.</p>`
		: `<p>Showing ${buffer.length.toLocaleString()} bytes.</p>`;

	return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>HCode Hex Viewer</title>
			<style nonce="${nonce}">
				body { margin: 0; padding: 16px; background: #071018; color: #d8e7f5; font-family: var(--vscode-editor-font-family); }
				h1 { margin-top: 0; font-size: 16px; }
				p { color: #9bb2c8; }
				table { width: 100%; border-collapse: collapse; font-size: 12px; }
				td, th { border-bottom: 1px solid #1d2a36; padding: 6px 8px; text-align: left; vertical-align: top; }
				th { color: #7bd8ff; }
				code { white-space: pre; }
			</style>
		</head>
		<body>
			<h1>${escapeHtml(vscode.workspace.asRelativePath(uri, false) || uri.fsPath)}</h1>
			${truncatedNotice}
			<table>
				<thead><tr><th>Offset</th><th>Hex</th><th>ASCII</th></tr></thead>
				<tbody>${rows.join('')}</tbody>
			</table>
		</body>
		</html>`;
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
