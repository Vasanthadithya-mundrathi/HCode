/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Buffer } from 'buffer';

// -- Flag pattern highlighter ------------------------------------------------

const FLAG_PATTERNS = [
	/\b(?:CTF|FLAG|picoCTF|HTB|THM|hackthebox|tryhackme|DUCTF|justCTF|rgbCTF|buckeye|CSC|flag)\{[^}]+\}/gi,
];

const flagDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: '#00ff4122',
	border: '1px solid #00ff41',
	borderRadius: '3px',
	color: '#00ff41',
	fontWeight: 'bold',
	overviewRulerColor: '#00ff41',
	overviewRulerLane: vscode.OverviewRulerLane.Right,
	light: {
		backgroundColor: '#00880022',
		border: '1px solid #008800',
		color: '#003300',
	},
});

function updateFlagDecorations(editor: vscode.TextEditor): void {
	const text = editor.document.getText();
	const ranges: vscode.DecorationOptions[] = [];
	for (const pattern of FLAG_PATTERNS) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(text)) !== null) {
			const start = editor.document.positionAt(match.index);
			const end = editor.document.positionAt(match.index + match[0].length);
			ranges.push({
				range: new vscode.Range(start, end),
				hoverMessage: new vscode.MarkdownString(
					`FLAG:  **Flag detected!** \`${match[0]}\``,
				),
			});
		}
	}
	editor.setDecorations(flagDecorationType, ranges);
}

// -- Encoding / decoding utilities -------------------------------------------

type Encoding =
	| 'base64-encode'
	| 'base64-decode'
	| 'base64url-encode'
	| 'base64url-decode'
	| 'hex-encode'
	| 'hex-decode'
	| 'binary-encode'
	| 'binary-decode'
	| 'url-encode'
	| 'url-decode'
	| 'html-encode'
	| 'html-decode'
	| 'base32-encode'
	| 'base32-decode'
	| 'base58-encode'
	| 'base58-decode'
	| 'reverse'
	| 'rot13'
	| 'rot47'
	| 'caesar-1'
	| 'caesar-3'
	| 'caesar-13'
	| 'atbash'
	| 'lowercase'
	| 'uppercase'
	| 'remove-whitespace'
	| 'jwt-header'
	| 'jwt-payload';

function transform(input: string, mode: Encoding): string {
	switch (mode) {
		case 'base64-encode':
			return Buffer.from(input, 'utf8').toString('base64');
		case 'base64-decode':
			return Buffer.from(input, 'base64').toString('utf8');
		case 'base64url-encode':
			return Buffer.from(input, 'utf8')
				.toString('base64')
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=+$/g, '');
		case 'base64url-decode':
			return Buffer.from(
				input
					.replace(/-/g, '+')
					.replace(/_/g, '/')
					.padEnd(Math.ceil(input.length / 4) * 4, '='),
				'base64',
			).toString('utf8');
		case 'hex-encode':
			return Buffer.from(input, 'utf8').toString('hex');
		case 'hex-decode':
			return Buffer.from(input, 'hex').toString('utf8');
		case 'binary-encode':
			return (
				Buffer.from(input, 'utf8')
					.toString('hex')
					.match(/.{1,2}/g)
					?.map((h: string) => parseInt(h, 16).toString(2).padStart(8, '0'))
					.join(' ') ?? ''
			);
		case 'binary-decode':
			return Buffer.from(
				(input.match(/[01]{8}/g) ?? []).map((bits) => parseInt(bits, 2)),
			).toString('utf8');
		case 'url-encode':
			return encodeURIComponent(input);
		case 'url-decode':
			return decodeURIComponent(input);
		case 'html-encode':
			return input
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		case 'html-decode':
			return input
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, String.fromCharCode(39))
				.replace(/&amp;/g, '&');
		case 'base32-encode':
			return base32Encode(input);
		case 'base32-decode':
			return base32Decode(input);
		case 'base58-encode':
			return base58Encode(input);
		case 'base58-decode':
			return base58Decode(input);
		case 'reverse':
			return input.split('').reverse().join('');
		case 'rot13':
			return input.replace(/[a-zA-Z]/g, (c) => {
				const base = c <= 'Z' ? 65 : 97;
				return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
			});
		case 'rot47':
			return input.replace(/[!-~]/g, (c) =>
				String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)),
			);
		case 'caesar-1':
			return caesar(input, 1);
		case 'caesar-3':
			return caesar(input, 3);
		case 'caesar-13':
			return caesar(input, 13);
		case 'atbash':
			return atbash(input);
		case 'lowercase':
			return input.toLowerCase();
		case 'uppercase':
			return input.toUpperCase();
		case 'remove-whitespace':
			return input.replace(/\s+/g, '');
		case 'jwt-header':
			return decodeJwtPart(input, 0);
		case 'jwt-payload':
			return decodeJwtPart(input, 1);
	}
}

function caesar(input: string, shift: number): string {
	return input.replace(/[a-zA-Z]/g, (c) => {
		const base = c <= 'Z' ? 65 : 97;
		return String.fromCharCode(((c.charCodeAt(0) - base + shift) % 26) + base);
	});
}

function atbash(input: string): string {
	return input.replace(/[a-zA-Z]/g, (c) => {
		if (c <= 'Z') {
			return String.fromCharCode(90 - (c.charCodeAt(0) - 65));
		}
		return String.fromCharCode(122 - (c.charCodeAt(0) - 97));
	});
}

function decodeJwtPart(jwt: string, index: number): string {
	const parts = jwt.trim().split('.');
	if (parts.length < 2 || !parts[index]) {
		return 'Invalid JWT format';
	}
	const payload = Buffer.from(
		parts[index]
			.replace(/-/g, '+')
			.replace(/_/g, '/')
			.padEnd(Math.ceil(parts[index].length / 4) * 4, '='),
		'base64',
	).toString('utf8');
	try {
		return JSON.stringify(JSON.parse(payload), null, 2);
	} catch {
		return payload;
	}
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(input: string): string {
	const bytes = Buffer.from(input, 'utf8');
	let bits = '';
	for (const byte of bytes) {
		bits += byte.toString(2).padStart(8, '0');
	}
	let result = '';
	for (let index = 0; index < bits.length; index += 5) {
		const chunk = bits.slice(index, index + 5).padEnd(5, '0');
		result += base32Alphabet[parseInt(chunk, 2)];
	}
	while (result.length % 8 !== 0) {
		result += '=';
	}
	return result;
}

function base32Decode(input: string): string {
	const clean = input.toUpperCase().replace(/=+$/g, '');
	let bits = '';
	for (const char of clean) {
		const value = base32Alphabet.indexOf(char);
		if (value === -1) {
			continue;
		}
		bits += value.toString(2).padStart(5, '0');
	}
	const bytes: number[] = [];
	for (let index = 0; index + 8 <= bits.length; index += 8) {
		bytes.push(parseInt(bits.slice(index, index + 8), 2));
	}
	return Buffer.from(bytes).toString('utf8');
}

const base58Alphabet =
	'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(input: string): string {
	const bytes = Buffer.from(input, 'utf8');
	let value = BigInt(`0x${bytes.toString('hex') || '0'}`);
	let result = '';
	while (value > 0n) {
		const remainder = Number(value % 58n);
		value = value / 58n;
		result = base58Alphabet[remainder] + result;
	}
	for (const byte of bytes) {
		if (byte === 0) {
			result = '1' + result;
		} else {
			break;
		}
	}
	return result || '1';
}

function base58Decode(input: string): string {
	let value = 0n;
	for (const char of input) {
		const index = base58Alphabet.indexOf(char);
		if (index === -1) {
			continue;
		}
		value = value * 58n + BigInt(index);
	}
	let hex = value.toString(16);
	if (hex.length % 2 !== 0) {
		hex = `0${hex}`;
	}
	let output = Buffer.from(hex || '00', 'hex');
	let leadingZeroes = 0;
	for (const char of input) {
		if (char === '1') {
			leadingZeroes++;
		} else {
			break;
		}
	}
	if (leadingZeroes > 0) {
		output = Buffer.concat([Buffer.alloc(leadingZeroes), output]);
	}
	return output.toString('utf8');
}

// -- Hash identifier ----------------------------------------------------------

interface HashSignature {
	name: string;
	length?: number;
	pattern: RegExp;
}

const HASH_SIGNATURES: HashSignature[] = [
	{ name: 'MD5', length: 32, pattern: /^[a-f0-9]{32}$/i },
	{ name: 'SHA-1', length: 40, pattern: /^[a-f0-9]{40}$/i },
	{ name: 'SHA-256', length: 64, pattern: /^[a-f0-9]{64}$/i },
	{ name: 'SHA-512', length: 128, pattern: /^[a-f0-9]{128}$/i },
	{ name: 'SHA-224', length: 56, pattern: /^[a-f0-9]{56}$/i },
	{ name: 'SHA-384', length: 96, pattern: /^[a-f0-9]{96}$/i },
	{ name: 'bcrypt', pattern: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/ },
	{ name: 'NTLM', length: 32, pattern: /^[a-f0-9]{32}$/i },
	{ name: 'MySQL4', length: 16, pattern: /^[a-f0-9]{16}$/i },
	{ name: 'CRC32', length: 8, pattern: /^[a-f0-9]{8}$/i },
	{
		name: 'MD5-crypt ($1$)',
		pattern: /^\$1\$[./a-zA-Z0-9]{1,8}\$[./a-zA-Z0-9]{22}$/,
	},
	{ name: 'SHA-512-crypt ($6$)', pattern: /^\$6\$[./a-zA-Z0-9]{1,16}\$/ },
	{ name: 'Base64', pattern: /^[a-zA-Z0-9+/]+=*$/ },
];

function identifyHash(hash: string): string[] {
	const trimmed = hash.trim();
	const matches = HASH_SIGNATURES.filter((sig) =>
		sig.pattern.test(trimmed),
	).map((sig) => sig.name);
	// de-duplicate (MD5 and NTLM both match 32-char hex)
	return [...new Set(matches)];
}

// -- XOR brute-force ----------------------------------------------------------

function xorBrute(hexInput: string): { key: number; result: string }[] {
	const bytes =
		hexInput
			.replace(/\s/g, '')
			.match(/.{2}/g)
			?.map((h) => parseInt(h, 16)) ?? [];
	const results: { key: number; result: string }[] = [];
	for (let key = 0; key <= 255; key++) {
		const decoded = bytes.map((b) => String.fromCharCode(b ^ key)).join('');
		// Only include results that contain mostly printable ASCII
		const printable = decoded
			.split('')
			.filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127).length;
		if (printable / decoded.length > 0.8) {
			results.push({ key, result: decoded });
		}
	}
	return results;
}

// -- Webview panel ------------------------------------------------------------

function getWebviewContent(webview: vscode.Webview): string {
	const nonce = getNonce();
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>HCode CTF Decoder</title>
<style nonce="${nonce}">
	* { box-sizing: border-box; margin: 0; padding: 0; }
	body {
		background: #0a0e0a; color: #c8ffc8; font-family: 'Courier New', monospace;
		font-size: 13px; padding: 16px;
	}
	h2 { color: #00ff41; margin-bottom: 12px; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; }
	h3 { color: #00e676; margin: 16px 0 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #1a3a1a; padding-bottom: 4px; }
	textarea, input[type="text"] {
		width: 100%; background: #0a140a; color: #c8ffc8; border: 1px solid #1a3a1a;
		border-radius: 3px; padding: 8px; font-family: 'Courier New', monospace; font-size: 12px;
		resize: vertical; outline: none;
	}
	textarea:focus, input:focus { border-color: #00ff41; }
	.row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
	button {
		background: #0f2a0f; color: #00ff41; border: 1px solid #1a3a1a;
		padding: 5px 12px; border-radius: 3px; cursor: pointer; font-family: 'Courier New', monospace;
		font-size: 11px; letter-spacing: 1px;
	}
	button:hover { background: #1a3a1a; border-color: #00ff41; }
	.output {
		margin-top: 8px; background: #040804; border: 1px solid #1a3a1a;
		border-radius: 3px; padding: 8px; min-height: 60px; white-space: pre-wrap;
		word-break: break-all; color: #39ff14;
	}
	.badge { display: inline-block; background: #ff003c; color: #fff; border-radius: 2px; padding: 1px 6px; font-size: 10px; margin-left: 4px; }
	.hash-result { color: #00bfff; margin-top: 4px; }
	.xor-row { display: flex; gap: 8px; align-items: center; color: #80c880; font-size: 11px; margin: 2px 0; }
	.xor-key { color: #ffbf00; width: 50px; flex-shrink: 0; }
	.divider { border: none; border-top: 1px solid #1a2e1a; margin: 16px 0; }
	.scroll-output { max-height: 200px; overflow-y: auto; }
</style>
</head>
<body>
<h2> HCode CTF Decoder</h2>

<h3>Encode / Decode</h3>
<textarea id="encInput" rows="3" placeholder="Paste text, hex, base64, or URL-encoded value..."></textarea>
<div class="row">
	<button data-mode="base64-encode">B64 Enc</button>
	<button data-mode="base64-decode">B64 Dec</button>
	<button data-mode="hex-encode">Hex Enc</button>
	<button data-mode="hex-decode">Hex Dec</button>
	<button data-mode="url-encode">URL Enc</button>
	<button data-mode="url-decode">URL Dec</button>
	<button data-mode="rot13">ROT13</button>
</div>
<div class="output" id="encOutput">Output will appear here...</div>

<hr class="divider">

<h3>Hash Identifier</h3>
<textarea id="hashInput" rows="2" placeholder="Paste hash value..."></textarea>
<div class="row"><button id="identify-hash">Identify Hash</button></div>
<div class="output hash-result" id="hashOutput"></div>

<hr class="divider">

<h3>XOR Brute-Force (single-byte key)</h3>
<textarea id="xorInput" rows="2" placeholder="Paste hex bytes (e.g. a3 f2 1c 45 ...)"></textarea>
<div class="row"><button id="brute-xor">Brute XOR</button></div>
<div class="output scroll-output" id="xorOutput"></div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

function transform(input, mode) {
	try {
		switch(mode) {
			case 'base64-encode': return btoa(unescape(encodeURIComponent(input)));
			case 'base64-decode': return decodeURIComponent(escape(atob(input)));
			case 'hex-encode': return Array.from(new TextEncoder().encode(input)).map(b => b.toString(16).padStart(2,'0')).join('');
			case 'hex-decode': return new TextDecoder().decode(new Uint8Array(input.replace(/\\s/g,'').match(/.{2}/g).map(h => parseInt(h,16))));
			case 'url-encode': return encodeURIComponent(input);
			case 'url-decode': return decodeURIComponent(input);
			case 'rot13': return input.replace(/[a-zA-Z]/g, c => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0)-b+13)%26)+b); });
		}
	} catch(e) { return 'Warning: Error: ' + e.message; }
}

function run(mode) {
	const input = document.getElementById('encInput').value;
	document.getElementById('encOutput').textContent = transform(input, mode);
}

const SIGS = [
	{ name: 'MD5 / NTLM (32)', len: 32, re: /^[a-f0-9]{32}$/i },
	{ name: 'SHA-1 (40)', len: 40, re: /^[a-f0-9]{40}$/i },
	{ name: 'SHA-256 (64)', len: 64, re: /^[a-f0-9]{64}$/i },
	{ name: 'SHA-512 (128)', len: 128, re: /^[a-f0-9]{128}$/i },
	{ name: 'bcrypt', re: /^\\$2[aby]\\$/ },
	{ name: 'MD5-crypt', re: /^\\$1\\$/ },
	{ name: 'SHA-512-crypt', re: /^\\$6\\$/ },
	{ name: 'CRC32 (8)', len: 8, re: /^[a-f0-9]{8}$/i },
	{ name: 'Base64', re: /^[a-zA-Z0-9+/]+=*$/ },
];

function identifyHash() {
	const h = document.getElementById('hashInput').value.trim();
	const matches = SIGS.filter(s => s.re.test(h)).map(s => s.name);
	const out = document.getElementById('hashOutput');
	out.textContent = matches.length ? 'Possible: Possible: ' + matches.join(', ') : 'Unknown: Unknown hash format';
}

function bruteXor() {
	const hex = document.getElementById('xorInput').value.replace(/\\s/g,'');
	const bytes = hex.match(/.{2}/g)?.map(h => parseInt(h,16)) ?? [];
	if (!bytes.length) { document.getElementById('xorOutput').textContent = 'Warning: No valid hex input'; return; }
	let html = '';
	for (let k = 0; k <= 255; k++) {
		const dec = bytes.map(b => String.fromCharCode(b^k)).join('');
		const printable = dec.split('').filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127).length;
		if (printable / dec.length > 0.8) {
			html += '<div class="xor-row"><span class="xor-key">key=0x' + k.toString(16).padStart(2,'0') + '</span><span>' + dec.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span></div>';
		}
	}
	document.getElementById('xorOutput').innerHTML = html || 'Error: No printable results found';
}

for (const button of document.querySelectorAll('button[data-mode]')) {
	button.addEventListener('click', () => run(button.getAttribute('data-mode')));
}

document.getElementById('identify-hash').addEventListener('click', identifyHash);
document.getElementById('brute-xor').addEventListener('click', bruteXor);
</script>
</body>
</html>`;
}

function getNonce(): string {
	const charset =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let index = 0; index < 32; index++) {
		nonce += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return nonce;
}

// -- Extension entry point ----------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
	// Flag decoration on open/change
	if (vscode.window.activeTextEditor) {
		updateFlagDecorations(vscode.window.activeTextEditor);
	}
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(
			(editor: vscode.TextEditor | undefined) => {
				if (editor) {
					updateFlagDecorations(editor);
				}
			},
		),
		vscode.workspace.onDidChangeTextDocument(
			(event: vscode.TextDocumentChangeEvent) => {
				const editor = vscode.window.activeTextEditor;
				if (editor && event.document === editor.document) {
					updateFlagDecorations(editor);
				}
			},
		),
	);

	// Command: Decode / Encode selection
	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.ctf.decode', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.selection.isEmpty) {
				vscode.window.showWarningMessage('HCode CTF: Select text first.');
				return;
			}
			const input = editor.document.getText(editor.selection);
			const mode = (await vscode.window.showQuickPick(
				[
					'base64-encode',
					'base64-decode',
					'base64url-encode',
					'base64url-decode',
					'hex-encode',
					'hex-decode',
					'binary-encode',
					'binary-decode',
					'url-encode',
					'url-decode',
					'html-encode',
					'html-decode',
					'base32-encode',
					'base32-decode',
					'base58-encode',
					'base58-decode',
					'reverse',
					'rot13',
					'rot47',
					'caesar-1',
					'caesar-3',
					'caesar-13',
					'atbash',
					'lowercase',
					'uppercase',
					'remove-whitespace',
					'jwt-header',
					'jwt-payload',
				],
				{ placeHolder: 'Choose encoding operation' },
			)) as Encoding | undefined;
			if (!mode) {
				return;
			}
			try {
				const result = transform(input, mode);
				await editor.edit((eb: vscode.TextEditorEdit) =>
					eb.replace(editor.selection, result),
				);
			} catch (err) {
				vscode.window.showErrorMessage(`HCode CTF: Decode failed - ${err}`);
			}
		}),
	);

	// Command: Identify hash
	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.ctf.hashIdentify', async () => {
			const editor = vscode.window.activeTextEditor;
			const input =
				editor?.selection.isEmpty === false
					? editor.document.getText(editor.selection).trim()
					: await vscode.window.showInputBox({ prompt: 'Paste hash value' });
			if (!input) {
				return;
			}
			const results = identifyHash(input);
			if (results.length === 0) {
				vscode.window.showInformationMessage(
					`HCode CTF: Unknown hash format - "${input.slice(0, 40)}..."`,
				);
			} else {
				vscode.window.showInformationMessage(
					`HCode CTF: Possible hash types -> ${results.join(', ')}`,
				);
			}
		}),
	);

	// Command: XOR brute-force
	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.ctf.xorBrute', async () => {
			const editor = vscode.window.activeTextEditor;
			const input =
				editor?.selection.isEmpty === false
					? editor.document.getText(editor.selection).trim()
					: await vscode.window.showInputBox({
						prompt: 'Paste hex bytes (space-separated)',
					});
			if (!input) {
				return;
			}
			const results = xorBrute(input);
			if (results.length === 0) {
				vscode.window.showInformationMessage(
					'HCode CTF: No printable XOR results found.',
				);
				return;
			}
			const items = results.map((r) => ({
				label: `key=0x${r.key.toString(16).padStart(2, '0')}`,
				description: r.result,
			}));
			const pick = await vscode.window.showQuickPick(items, {
				placeHolder: 'XOR brute-force results - select to copy',
			});
			if (pick) {
				await vscode.env.clipboard.writeText(pick.description ?? '');
				vscode.window.showInformationMessage(`Copied: ${pick.description}`);
			}
		}),
	);

	// Command: Open webview panel
	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.ctf.openPanel', () => {
			const panel = vscode.window.createWebviewPanel(
				'hcode.ctf',
				'HCode CTF Decoder',
				vscode.ViewColumn.Beside,
				{ enableScripts: true },
			);
			panel.webview.html = getWebviewContent(panel.webview);
		}),
	);
}

export function deactivate(): void {
	/* no-op */
}
