/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { registerBugBountyTools } from './tools/bugbounty.js';
import { registerDeviceTools } from './tools/devices.js';
import { registerSecurityToolTools } from './tools/tools.js';
import { registerCTFTools } from './tools/ctf.js';
import { registerSkillTools } from './tools/skills.js';
import { registerCapabilityTools } from './tools/capabilities.js';
import {
	isHCodeBugBountyAPI,
	isHCodeDevicesAPI,
	isHCodeSkillsAPI,
	isHCodeToolsAPI,
	type IHCodeBugBountyAPI,
	type IHCodeDevicesAPI,
	type IHCodeToolsAPI,
	type IHCodeSkillsAPI,
} from './types.js';

let httpServer: http.Server | undefined;
let activePort: number | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let secretStorage: vscode.SecretStorage | undefined;

const mcpAuthTokenSecretKey = 'hcode.mcp.authToken';

export interface HCodeMCPServerApi {
	startServer(): Promise<void>;
	stopServer(): void;
	copyServerUrl(): Promise<void>;
	getStatus(): { isRunning: boolean; port: number; url: string };
}

/** Cached extension APIs — loaded once when the server starts */
interface HCodeAPIs {
	bb: IHCodeBugBountyAPI;
	dev: IHCodeDevicesAPI;
	tools: IHCodeToolsAPI;
	skills: IHCodeSkillsAPI | undefined;
}

interface ExtensionLoadResult<T> {
	api?: T;
	failureMessage?: string;
}

/**
 * Build a fresh McpServer with all tools registered.
 * Called once per HTTP request so each request gets a clean stateless transport connection.
 */
function buildMcpServer(apis: HCodeAPIs): McpServer {
	const mcp = new McpServer({ name: 'hcode', version: '1.0.0' });
	registerCapabilityTools(mcp);
	registerBugBountyTools(mcp, apis.bb);
	registerDeviceTools(mcp, apis.dev);
	registerSecurityToolTools(mcp, apis.tools);
	registerCTFTools(mcp);
	if (apis.skills) { registerSkillTools(mcp, apis.skills); }
	return mcp;
}

export async function activate(context: vscode.ExtensionContext): Promise<HCodeMCPServerApi> {
	secretStorage = context.secrets;
	outputChannel = vscode.window.createOutputChannel('HCode MCP Server');
	context.subscriptions.push(outputChannel);

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.mcp.startServer', () => startServer()),
		vscode.commands.registerCommand('hcode.mcp.stopServer', stopServer),
		vscode.commands.registerCommand('hcode.mcp.copyServerUrl', copyServerUrl),
		vscode.commands.registerCommand('hcode.mcp.setAuthToken', setAuthToken),
		vscode.commands.registerCommand('hcode.mcp.clearAuthToken', clearAuthToken),
	);

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
	statusBarItem.command = 'hcode.mcp.copyServerUrl';
	context.subscriptions.push(statusBarItem);
	setStatusBarStopped();

	const config = vscode.workspace.getConfiguration('hcode.mcp');
	if (config.get<boolean>('autoStart', true)) {
		await startServer();
	}

	return {
		startServer: () => startServer(),
		stopServer,
		copyServerUrl,
		getStatus: () => getServerStatus(),
	};
}

export function deactivate(): void {
	stopServer();
}

async function startServer(): Promise<void> {
	if (httpServer) {
		log('Server already running.');
		return;
	}

	const configuration = vscode.workspace.getConfiguration('hcode.mcp');
	const preferredPort = configuration.get<number>('port', 6767);
	const authRequired = configuration.get<boolean>('requireAuth', false);

	if (authRequired) {
		const authToken = await getAuthToken();
		if (!authToken) {
			const selection = await vscode.window.showErrorMessage(
				'HCode MCP Server: authentication is enabled but no MCP auth token is configured.',
				'Set Token',
			);
			if (selection === 'Set Token') {
				await setAuthToken();
			}
			return;
		}
	}

	// Load sibling extension APIs (activate them if not yet active)
	const bbExt = await loadExtensionApi('hcode.hcode-bugbounty', 'hcode-bugbounty', isHCodeBugBountyAPI);
	const devExt = await loadExtensionApi('hcode.hcode-devices', 'hcode-devices', isHCodeDevicesAPI);
	const toolsExt = await loadExtensionApi('hcode.hcode-tools', 'hcode-tools', isHCodeToolsAPI);
	const skillsExt = await loadExtensionApi('hcode.hcode-skills', 'hcode-skills', isHCodeSkillsAPI);

	if (!bbExt.api || !devExt.api || !toolsExt.api) {
		const missing = [
			!bbExt.api && (bbExt.failureMessage ?? 'hcode-bugbounty'),
			!devExt.api && (devExt.failureMessage ?? 'hcode-devices'),
			!toolsExt.api && (toolsExt.failureMessage ?? 'hcode-tools'),
		].filter(Boolean).join(', ');
		vscode.window.showErrorMessage(`HCode MCP Server: cannot start — dependency validation failed: ${missing}`);
		return;
	}

	if (!skillsExt.api) {
		log(`Warning: ${skillsExt.failureMessage ?? 'hcode-skills extension not found'} — skill tools will not be available.`);
	}

	const apis: HCodeAPIs = { bb: bbExt.api, dev: devExt.api, tools: toolsExt.api, skills: skillsExt.api };

	// HTTP handler: one fresh McpServer + transport per request (stateless pattern)
	const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
		if (!isOriginAllowed(req)) {
			res.writeHead(403, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Origin is not allowed for the HCode MCP endpoint.' }));
			return;
		}

		// CORS pre-flight
		if (req.method === 'OPTIONS') {
			res.writeHead(204, corsHeaders(req));
			res.end();
			return;
		}

		if (authRequired) {
			const authError = await getAuthorizationError(req);
			if (authError) {
				res.writeHead(401, {
					'Content-Type': 'application/json',
					'WWW-Authenticate': 'Bearer',
					...corsHeaders(req)
				});
				res.end(JSON.stringify({ error: authError }));
				return;
			}
		}

		if (req.url !== '/mcp' && req.url !== '/mcp/') {
			res.writeHead(404, { 'Content-Type': 'text/plain', ...corsHeaders(req) });
			res.end('Not Found — HCode MCP endpoint is at /mcp');
			return;
		}

		const mcp = buildMcpServer(apis);

		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined, // stateless: no session maintenance
		});

		res.on('close', () => transport.close());

		try {
			await mcp.connect(transport);
			const body = await readBody(req);
			await transport.handleRequest(req, res, body);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			log(`Request error: ${message}`);
			if (!res.headersSent) {
				res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders(req) });
				res.end(JSON.stringify({ error: message }));
			}
		}
	});

	const port = await listenOnAvailablePort(server, preferredPort);
	httpServer = server;
	activePort = port;

	const url = `http://localhost:${port}/mcp`;
	log(`HCode MCP Server started at ${url}`);
	log(authRequired
		? 'MCP bearer-token authentication is enabled.'
		: 'MCP bearer-token authentication is disabled; endpoint remains loopback-bound.');
	log('Connect AI agents (Cline, Kilo Code, Copilot): { "type": "http", "url": "' + url + '" }');
	if (port !== preferredPort) {
		log(`Preferred port ${preferredPort} was unavailable. Using ${port} instead.`);
		vscode.window.showWarningMessage(`HCode MCP Server: port ${preferredPort} was busy, using ${port} instead.`);
	}
	setStatusBarRunning(port);

	server.on('error', (err: NodeJS.ErrnoException) => {
		vscode.window.showErrorMessage(`HCode MCP Server error: ${err.message}`);
		httpServer = undefined;
		activePort = undefined;
		setStatusBarStopped();
	});
}

function stopServer(): void {
	if (!httpServer) {
		return;
	}
	httpServer.close(() => {
		log('HCode MCP Server stopped.');
		setStatusBarStopped();
	});
	httpServer = undefined;
	activePort = undefined;
}

function getServerStatus(): { isRunning: boolean; port: number; url: string } {
	const port = activePort ?? vscode.workspace.getConfiguration('hcode.mcp').get<number>('port', 6767);
	return {
		isRunning: Boolean(httpServer?.listening),
		port,
		url: `http://localhost:${port}/mcp`,
	};
}

async function copyServerUrl(): Promise<void> {
	if (!httpServer || !httpServer.listening) {
		vscode.window.showInformationMessage('HCode MCP Server is not running. Use the "HCode MCP: Start Server" command.');
		return;
	}
	const port = activePort ?? vscode.workspace.getConfiguration('hcode.mcp').get<number>('port', 6767);
	const url = `http://localhost:${port}/mcp`;
	await vscode.env.clipboard.writeText(url);
	vscode.window.showInformationMessage(`Copied to clipboard: ${url}`);
}

async function setAuthToken(): Promise<void> {
	if (!secretStorage) {
		return;
	}

	const value = await vscode.window.showInputBox({
		prompt: 'Set the bearer token required by HCode MCP clients',
		placeHolder: 'Paste a high-entropy token',
		ignoreFocusOut: true,
		password: true,
		validateInput: input => input.trim() ? undefined : 'Token is required'
	});

	if (!value) {
		return;
	}

	await secretStorage.store(mcpAuthTokenSecretKey, value.trim());
	vscode.window.showInformationMessage('HCode MCP auth token stored in secret storage.');
}

async function clearAuthToken(): Promise<void> {
	if (!secretStorage) {
		return;
	}

	await secretStorage.delete(mcpAuthTokenSecretKey);
	vscode.window.showInformationMessage('HCode MCP auth token cleared from secret storage.');
}

async function getAuthToken(): Promise<string | undefined> {
	return secretStorage?.get(mcpAuthTokenSecretKey);
}

// Helpers

async function loadExtensionApi<T>(id: string, displayName: string, validate: (value: unknown) => value is T): Promise<ExtensionLoadResult<T>> {
	const ext = vscode.extensions.getExtension<T>(id);
	if (!ext) {
		const failureMessage = `${displayName} extension not found`;
		log(`Warning: ${failureMessage}`);
		return { failureMessage };
	}
	if (!ext.isActive) {
		try {
			await ext.activate();
		} catch (err: unknown) {
			const failureMessage = `failed to activate ${displayName}: ${err instanceof Error ? err.message : String(err)}`;
			log(`Warning: ${failureMessage}`);
			return { failureMessage };
		}
	}

	if (!validate(ext.exports)) {
		const failureMessage = `${displayName} exports are invalid`;
		log(`Warning: ${failureMessage}`);
		return { failureMessage };
	}

	return { api: ext.exports };
}

async function listenOnAvailablePort(server: http.Server, preferredPort: number): Promise<number> {
	const maxAttempts = 10;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const candidatePort = preferredPort + attempt;
		try {
			await new Promise<void>((resolve, reject) => {
				const handleError = (error: NodeJS.ErrnoException) => {
					server.removeListener('listening', handleListening);
					reject(error);
				};
				const handleListening = () => {
					server.removeListener('error', handleError);
					resolve();
				};

				server.once('error', handleError);
				server.once('listening', handleListening);
				server.listen(candidatePort, '127.0.0.1');
			});

			return candidatePort;
		} catch (error) {
			const listenError = error as NodeJS.ErrnoException;
			if (listenError.code !== 'EADDRINUSE' || attempt === maxAttempts - 1) {
				throw listenError;
			}
		}
	}

	throw new Error('No available MCP server ports were found.');
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

async function getAuthorizationError(req: http.IncomingMessage): Promise<string | undefined> {
	const configuredToken = await getAuthToken();
	if (!configuredToken) {
		return 'HCode MCP authentication is enabled but no server token is configured.';
	}

	const authorization = req.headers.authorization;
	if (!authorization?.startsWith('Bearer ')) {
		return 'Missing bearer token.';
	}

	const providedToken = authorization.slice('Bearer '.length).trim();
	if (!providedToken || providedToken !== configuredToken) {
		return 'Invalid bearer token.';
	}

	return undefined;
}

function corsHeaders(req: http.IncomingMessage): Record<string, string> {
	const headers: Record<string, string> = {
		'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type, mcp-session-id',
	};

	const origin = getRequestOrigin(req);
	if (origin && isOriginAllowed(req)) {
		headers['Access-Control-Allow-Origin'] = origin;
	}

	return headers;
}

function isOriginAllowed(req: http.IncomingMessage): boolean {
	const origin = getRequestOrigin(req);
	if (!origin) {
		return true;
	}

	try {
		const parsedOrigin = new URL(origin);
		if (isLoopbackHost(parsedOrigin.hostname)) {
			return true;
		}
	} catch {
		return false;
	}

	const configuredOrigins = vscode.workspace.getConfiguration('hcode.mcp').get<string[]>('allowedOrigins', []);
	return configuredOrigins.includes(origin);
}

function getRequestOrigin(req: http.IncomingMessage): string | undefined {
	const originHeader = req.headers.origin;
	if (Array.isArray(originHeader)) {
		return originHeader[0];
	}
	return originHeader;
}

function isLoopbackHost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function log(msg: string): void {
	outputChannel?.appendLine(`[${new Date().toISOString()}] ${msg}`);
	console.log(`[hcode-mcp] ${msg}`);
}

function setStatusBarRunning(port: number): void {
	if (!statusBarItem) { return; }
	const authEnabled = vscode.workspace.getConfiguration('hcode.mcp').get<boolean>('requireAuth', false);
	statusBarItem.text = `$(broadcast) MCP :${port}`;
	statusBarItem.tooltip = authEnabled
		? `HCode MCP Server running on port ${port} with bearer-token authentication enabled. Click to copy URL.`
		: `HCode MCP Server running on port ${port}. Click to copy URL.`;
	statusBarItem.backgroundColor = undefined;
	statusBarItem.show();
}

function setStatusBarStopped(): void {
	if (!statusBarItem) { return; }
	statusBarItem.text = `$(circle-slash) MCP offline`;
	statusBarItem.tooltip = 'HCode MCP Server stopped. Click command palette → HCode MCP: Start Server';
	statusBarItem.show();
}
