/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AceAcpRuntime } from './acpRuntime';
import { acePersonas, getPersona } from './personas';
import { AceProviderRegistry } from './providerRegistry';
import { AceProviderRuntime } from './providerRuntime';
import { aceSkillPacks } from './skillPacks';
import { AceAcpRunResult, AceDashboardModel, AceMcpStatus, AceProviderInvocationResult } from './types';

interface HCodeMCPServerApi {
	startServer(): Promise<void>;
	stopServer(): void;
	copyServerUrl(): Promise<void>;
	getStatus(): { isRunning: boolean; port: number; url: string };
}

export interface HCodeACEApi {
	getDashboardModel(): Promise<AceDashboardModel>;
	getAcpSpec(): Promise<string>;
}

export function activate(context: vscode.ExtensionContext): HCodeACEApi {
	const providerRegistry = new AceProviderRegistry(context.secrets, vscode.workspace);
	const providerRuntime = new AceProviderRuntime(providerRegistry, vscode.workspace);
	const dashboardProvider = new AceDashboardViewProvider(context.extensionUri, providerRegistry);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(AceDashboardViewProvider.viewId, dashboardProvider),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('hcode.ace') || event.affectsConfiguration('hcode.mcp')) {
				dashboardProvider.refresh();
			}
		}),
		vscode.commands.registerCommand('hcode.ace.openDashboard', async () => {
			await vscode.commands.executeCommand('workbench.view.extension.hcode');
		}),
		vscode.commands.registerCommand('hcode.ace.configureProviderKey', async () => {
			await configureProviderKey(providerRegistry);
			dashboardProvider.refresh();
		}),
		vscode.commands.registerCommand('hcode.ace.clearProviderKey', async () => {
			await clearProviderKey(providerRegistry);
			dashboardProvider.refresh();
		}),
		vscode.commands.registerCommand('hcode.ace.runPrompt', async () => {
			await runProviderPrompt(providerRuntime);
			dashboardProvider.refresh();
		}),
		vscode.commands.registerCommand('hcode.ace.runObjective', async () => {
			await runAcpObjective(providerRuntime);
			dashboardProvider.refresh();
		}),
		vscode.commands.registerCommand('hcode.ace.copyMcpUrl', async () => {
			await vscode.env.clipboard.writeText(getMcpUrl());
			void vscode.window.showInformationMessage(`ACE: Copied MCP URL ${getMcpUrl()}`);
		}),
		vscode.commands.registerCommand('hcode.ace.copyAcpSpec', async () => {
			await vscode.env.clipboard.writeText(buildAcpSpec());
			void vscode.window.showInformationMessage('ACE: ACP beta spec copied to clipboard.');
		}),
		vscode.commands.registerCommand('hcode.ace.showPersona', async () => {
			const persona = getDefaultPersona();
			const document = await vscode.workspace.openTextDocument({
				language: 'markdown',
				content: renderPersonaMarkdown(persona.id)
			});
			await vscode.window.showTextDocument(document, { preview: false });
		}),
		vscode.commands.registerCommand('hcode.ace.startMcpBridge', async () => {
			const mcpApi = await getMcpApi();
			if (mcpApi) {
				await mcpApi.startServer();
			} else {
				await vscode.commands.executeCommand('hcode.mcp.startServer');
			}
			dashboardProvider.refresh();
		}),
		vscode.commands.registerCommand('hcode.ace.stopMcpBridge', async () => {
			const mcpApi = await getMcpApi();
			if (mcpApi) {
				mcpApi.stopServer();
			} else {
				await vscode.commands.executeCommand('hcode.mcp.stopServer');
			}
			dashboardProvider.refresh();
		})
	);

	return {
		getDashboardModel: () => getDashboardModel(providerRegistry, providerRuntime),
		getAcpSpec: async () => buildAcpSpec()
	};
}

export function deactivate(): void {
	// no-op
}

class AceDashboardViewProvider implements vscode.WebviewViewProvider {
	static readonly viewId = 'hcode.ace.panel';

	private view: vscode.WebviewView | undefined;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly providerRegistry: AceProviderRegistry
	) { }

	resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
		};

		webviewView.webview.onDidReceiveMessage(async message => {
			switch (message.command) {
				case 'configureProvider':
					await vscode.commands.executeCommand('hcode.ace.configureProviderKey');
					break;
				case 'runPrompt':
					await vscode.commands.executeCommand('hcode.ace.runPrompt');
					break;
				case 'runObjective':
					await vscode.commands.executeCommand('hcode.ace.runObjective');
					break;
				case 'copyMcp':
					await vscode.commands.executeCommand('hcode.ace.copyMcpUrl');
					break;
				case 'startMcp':
					await vscode.commands.executeCommand('hcode.ace.startMcpBridge');
					break;
				case 'stopMcp':
					await vscode.commands.executeCommand('hcode.ace.stopMcpBridge');
					break;
				case 'copyAcp':
					await vscode.commands.executeCommand('hcode.ace.copyAcpSpec');
					break;
				case 'showPersona':
					await vscode.commands.executeCommand('hcode.ace.showPersona');
					break;
			}
		});

		void this.render();
	}

	refresh(): void {
		void this.render();
	}

	private async render(): Promise<void> {
		if (!this.view) {
			return;
		}

		const dashboard = await getDashboardModel(this.providerRegistry, new AceProviderRuntime(this.providerRegistry, vscode.workspace));
		const logoUri = this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'ace-logo.svg'));
		this.view.title = 'ACE';
		this.view.description = 'Autonomous Control Engine';
		this.view.webview.html = getDashboardHtml(this.view.webview, logoUri, dashboard);
	}
}

async function configureProviderKey(providerRegistry: AceProviderRegistry): Promise<void> {
	const providerStatuses = await providerRegistry.getStatuses();
	const pick = await vscode.window.showQuickPick(
		providerStatuses.map(provider => ({
			label: provider.label,
			description: provider.isConfigured ? 'Configured' : 'Not configured',
			detail: provider.description,
			providerId: provider.id
		})),
		{ placeHolder: 'Select a provider to configure' }
	);

	if (!pick) {
		return;
	}

	const provider = providerRegistry.getProvider(pick.providerId);
	if (!provider) {
		return;
	}

	const apiKey = await vscode.window.showInputBox({
		prompt: `${provider.apiKeyLabel}`,
		placeHolder: provider.endpointHint,
		ignoreFocusOut: true,
		password: true,
		validateInput: value => value.trim() ? undefined : 'API key is required'
	});

	if (!apiKey) {
		return;
	}

	await providerRegistry.setApiKey(provider.id, apiKey.trim());
	void vscode.window.showInformationMessage(`ACE: Stored secret for ${provider.label}.`);
}

async function clearProviderKey(providerRegistry: AceProviderRegistry): Promise<void> {
	const providerStatuses = await providerRegistry.getStatuses();
	const configuredProviders = providerStatuses.filter(provider => provider.isConfigured);
	if (!configuredProviders.length) {
		void vscode.window.showInformationMessage('ACE: No configured provider secrets to clear.');
		return;
	}

	const pick = await vscode.window.showQuickPick(
		configuredProviders.map(provider => ({
			label: provider.label,
			detail: provider.description,
			providerId: provider.id
		})),
		{ placeHolder: 'Select a provider secret to clear' }
	);

	if (!pick) {
		return;
	}

	await providerRegistry.clearApiKey(pick.providerId);
	void vscode.window.showInformationMessage(`ACE: Cleared stored secret for ${pick.label}.`);
}

async function runProviderPrompt(providerRuntime: AceProviderRuntime): Promise<void> {
	const prompt = await vscode.window.showInputBox({
		prompt: 'ACE prompt',
		placeHolder: 'Ask the active provider to reason, summarize, or plan.',
		ignoreFocusOut: true,
		validateInput: value => value.trim() ? undefined : 'Prompt is required',
	});

	if (!prompt) {
		return;
	}

	const persona = getDefaultPersona();
	const result = await providerRuntime.invoke({
		prompt: prompt.trim(),
		systemPrompt: persona.systemPrompt,
	});

	const document = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content: renderInvocationMarkdown(prompt.trim(), persona.id, result),
	});
	await vscode.window.showTextDocument(document, { preview: false });
}

async function runAcpObjective(providerRuntime: AceProviderRuntime): Promise<void> {
	if (!vscode.workspace.getConfiguration('hcode.ace').get<boolean>('enableACPBeta', true)) {
		void vscode.window.showWarningMessage('ACE ACP Beta is disabled in settings.');
		return;
	}

	const objective = await vscode.window.showInputBox({
		prompt: 'ACE objective',
		placeHolder: 'Describe the bounded objective ACE should decompose into short-lived workers.',
		ignoreFocusOut: true,
		validateInput: value => value.trim() ? undefined : 'Objective is required',
	});

	if (!objective) {
		return;
	}

	const persona = getDefaultPersona();
	const activeProviderId = vscode.workspace.getConfiguration('hcode.ace').get<string>('activeProvider', 'openai');
	const acpRuntime = new AceAcpRuntime(providerRuntime, vscode.workspace.getConfiguration('hcode.ace').get<number>('acpMaxWorkers', 3));
	const result = await acpRuntime.runObjective(objective.trim(), persona, activeProviderId);

	const document = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content: renderAcpMarkdown(result),
	});
	await vscode.window.showTextDocument(document, { preview: false });
}

async function getDashboardModel(providerRegistry: AceProviderRegistry, providerRuntime: AceProviderRuntime): Promise<AceDashboardModel> {
	const aceConfiguration = vscode.workspace.getConfiguration('hcode.ace');
	const activeProviderId = aceConfiguration.get<string>('activeProvider', 'openai');
	let activeModel = 'not-configured';
	try {
		activeModel = await providerRuntime.getActiveModel(activeProviderId);
	} catch {
		activeModel = 'not-configured';
	}
	return {
		activeProviderId,
		activeModel,
		defaultPersonaId: aceConfiguration.get<string>('defaultPersona', 'ace-vanguard'),
		providers: await providerRegistry.getStatuses(),
		personas: [...acePersonas],
		skillPacks: [...aceSkillPacks],
		mcpStatus: await getMcpStatus(),
		mcpEnabled: aceConfiguration.get<boolean>('enableMCPBridge', true),
		acpEnabled: aceConfiguration.get<boolean>('enableACPBeta', true),
		acpMaxWorkers: aceConfiguration.get<number>('acpMaxWorkers', 3),
		xbowInspiredLoop: aceConfiguration.get<boolean>('xbowInspiredLoop', true)
	};
}

function getMcpUrl(): string {
	const port = vscode.workspace.getConfiguration('hcode.mcp').get<number>('port', 6767);
	return `http://localhost:${port}/mcp`;
}

async function getMcpStatus(): Promise<AceMcpStatus> {
	const mcpApi = await getMcpApi();
	if (mcpApi) {
		const status = mcpApi.getStatus();
		return {
			isRunning: status.isRunning,
			url: status.url,
			port: status.port,
		};
	}

	const port = vscode.workspace.getConfiguration('hcode.mcp').get<number>('port', 6767);
	return {
		isRunning: false,
		url: getMcpUrl(),
		port,
	};
}

async function getMcpApi(): Promise<HCodeMCPServerApi | undefined> {
	const extension = vscode.extensions.getExtension<HCodeMCPServerApi>('hcode.hcode-mcp-server');
	if (!extension) {
		return undefined;
	}
	if (!extension.isActive) {
		await extension.activate();
	}
	return extension.exports;
}

function getDefaultPersona() {
	const personaId = vscode.workspace.getConfiguration('hcode.ace').get<string>('defaultPersona', 'ace-vanguard');
	return getPersona(personaId) ?? acePersonas[0];
}

function renderPersonaMarkdown(personaId: string): string {
	const persona = getPersona(personaId) ?? acePersonas[0];
	return [
		`# ${persona.label}`,
		'',
		`${persona.tagline}`,
		'',
		'## Description',
		'',
		persona.description,
		'',
		'## System Prompt',
		'',
		'```text',
		persona.systemPrompt,
		'```',
		'',
		'## Operating Modes',
		...persona.operatingModes.map(mode => `- ${mode}`),
		'',
		'## Guardrails',
		...persona.guardrails.map(guardrail => `- ${guardrail}`)
	].join('\n');
}

function buildAcpSpec(): string {
	return JSON.stringify({
		name: 'ace-control-plane',
		version: '0.1.0-beta',
		mode: 'short-lived-workers',
		coordinator: 'persistent',
		validation: 'deterministic',
		routing: ['api-key providers', 'mcp bridge', 'local cli adapters'],
		safety: ['explicit scope policy', 'bounded task chains', 'human review before report promotion'],
		xbowInspiredLoop: ['decompose objective', 'spawn narrow workers', 'validate independently', 'promote surviving evidence']
	}, null, 2);
}

function renderInvocationMarkdown(prompt: string, personaId: string, result: AceProviderInvocationResult): string {
	return [
		'# ACE Prompt Result',
		'',
		`- Provider: ${result.providerLabel} (${result.providerId})`,
		`- Model: ${result.model}`,
		`- Persona: ${personaId}`,
		`- Endpoint: ${result.endpoint}`,
		`- Latency: ${result.latencyMs} ms`,
		'',
		'## Prompt',
		'',
		prompt,
		'',
		'## Response',
		'',
		result.text,
	].join('\n');
}

function renderAcpMarkdown(result: AceAcpRunResult): string {
	const workerSections = result.workers.map(worker => [
		`### ${worker.title}`,
		'',
		`- Objective: ${worker.objective}`,
		`- Validation: ${worker.validation}`,
		`- Confidence: ${worker.confidence}`,
		`- Validation Hint: ${worker.validationHint}`,
		'',
		'#### Output',
		'',
		worker.output || 'No output returned.',
		'',
		'#### Evidence',
		'',
		...(worker.evidence.length ? worker.evidence.map(item => `- ${item}`) : ['- No evidence returned.']),
	].join('\n'));

	return [
		'# ACE ACP Run',
		'',
		`- Objective: ${result.objective}`,
		`- Provider: ${result.providerId}`,
		`- Persona: ${result.personaId}`,
		'',
		'## Plan',
		'',
		...result.plan.map((task, index) => `${index + 1}. ${task.title} - ${task.objective}`),
		'',
		'## Worker Results',
		'',
		...workerSections,
		'',
		'## Summary',
		'',
		result.summary,
	].join('\n');
}

function getDashboardHtml(webview: vscode.Webview, logoUri: vscode.Uri, dashboard: AceDashboardModel): string {
	const persona = getPersona(dashboard.defaultPersonaId) ?? acePersonas[0];
	const providerCards = dashboard.providers.map(provider => `
		<div class="card provider ${provider.isDefault ? 'default' : ''}">
			<div class="card-title-row">
				<h3>${escapeHtml(provider.label)}</h3>
				<span class="pill ${provider.isConfigured ? 'configured' : 'pending'}">${provider.isConfigured ? 'Configured' : 'Needs key'}</span>
			</div>
			<p>${escapeHtml(provider.description)}</p>
			<div class="meta">${provider.capabilities.map(capability => `<span>${escapeHtml(capability)}</span>`).join('')}</div>
		</div>`).join('');

	const skillCards = dashboard.skillPacks.map(skill => `
		<div class="card skill">
			<h3>${escapeHtml(skill.label)}</h3>
			<p>${escapeHtml(skill.description)}</p>
			<div class="meta">${skill.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
		</div>`).join('');

	const personaGuardrails = persona.guardrails.map(guardrail => `<li>${escapeHtml(guardrail)}</li>`).join('');
	const mcpActionButton = dashboard.mcpStatus.isRunning
		? '<button id="stop-mcp" class="secondary">Stop MCP Bridge</button>'
		: '<button id="start-mcp">Start MCP Bridge</button>';
	const xbowLoop = dashboard.xbowInspiredLoop ? `
		<div class="card protocol">
			<h3>XBow-Inspired Beta Loop</h3>
			<p>ACE models the beta control plane around short-lived workers, persistent coordination, and deterministic promotion of surviving evidence.</p>
			<ol>
				<li>Decompose a scoped objective into narrow tasks.</li>
				<li>Dispatch short-lived workers with fresh context.</li>
				<li>Validate outputs with deterministic tool checks.</li>
				<li>Only promote evidence that survives bounded validation.</li>
			</ol>
		</div>` : '';

	const nonce = getNonce();
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>ACE Dashboard</title>
	<style nonce="${nonce}">
		:root {
			color-scheme: dark;
			--bg: #081018;
			--panel: #0d1620;
			--panel-alt: #121d28;
			--border: #203040;
			--text: #ebf6ff;
			--muted: #98adbf;
			--accent-a: #30f2c5;
			--accent-b: #00b3ff;
			--accent-c: #8c62ff;
			--ok: #29d17d;
			--warn: #ffc95c;
		}

		body {
			margin: 0;
			padding: 16px;
			font-family: var(--vscode-font-family);
			background:
				radial-gradient(circle at top right, rgba(48, 242, 197, 0.14), transparent 28%),
				radial-gradient(circle at bottom left, rgba(140, 98, 255, 0.14), transparent 26%),
				var(--bg);
			color: var(--text);
		}

		main {
			display: grid;
			gap: 16px;
		}

		.hero,
		.card,
		.section {
			background: rgba(13, 22, 32, 0.92);
			border: 1px solid var(--border);
			border-radius: 18px;
			box-shadow: 0 18px 36px rgba(0, 0, 0, 0.18);
		}

		.hero {
			padding: 18px;
		}

		.hero img {
			width: 100%;
			height: auto;
			display: block;
			margin-bottom: 14px;
		}

		.hero h1,
		.section h2,
		.card h3 {
			margin: 0;
		}

		.hero p,
		.card p,
		.section p,
		li {
			color: var(--muted);
			line-height: 1.45;
		}

		.hero-actions,
		.grid {
			display: grid;
			gap: 10px;
		}

		.grid {
			grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		}

		.section {
			padding: 16px;
		}

		.card {
			padding: 14px;
		}

		.card-title-row {
			display: flex;
			justify-content: space-between;
			gap: 10px;
			align-items: center;
			margin-bottom: 8px;
		}

		.meta {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			margin-top: 10px;
		}

		.meta span,
		.pill {
			display: inline-flex;
			align-items: center;
			padding: 4px 8px;
			border-radius: 999px;
			font-size: 12px;
			border: 1px solid rgba(255, 255, 255, 0.08);
			background: var(--panel-alt);
		}

		.pill.configured {
			color: var(--ok);
		}

		.pill.pending {
			color: var(--warn);
		}

		.provider.default {
			border-color: rgba(48, 242, 197, 0.4);
		}

		button {
			border: 0;
			border-radius: 12px;
			padding: 10px 12px;
			font: inherit;
			font-weight: 600;
			cursor: pointer;
			color: #06131c;
			background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
		}

		button.secondary {
			background: var(--panel-alt);
			color: var(--text);
			border: 1px solid var(--border);
		}

		.protocol-row {
			display: grid;
			gap: 10px;
		}

		pre {
			white-space: pre-wrap;
			word-break: break-word;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 12px;
			background: #0a1219;
			padding: 12px;
			border-radius: 12px;
			border: 1px solid var(--border);
			color: var(--text);
		}
	</style>
</head>
<body>
	<main>
		<section class="hero" aria-label="ACE hero">
			<img src="${logoUri}" alt="ACE logo">
			<h1>${escapeHtml(persona.label)}</h1>
			<p>${escapeHtml(persona.tagline)}. ACE is HCode's native control plane for agent orchestration, provider routing, skill packs, and protocol bridges.</p>
			<div class="hero-actions">
				<button id="configure-provider">Configure Provider Key</button>
				<button id="run-prompt">Run Prompt</button>
				<button id="run-objective">Run Objective</button>
				<button id="show-persona" class="secondary">Show Persona Prompt</button>
			</div>
		</section>

		<section class="section" aria-label="ACE persona">
			<h2>Persona</h2>
			<p>${escapeHtml(persona.description)}</p>
			<ul>${personaGuardrails}</ul>
		</section>

		<section class="section" aria-label="ACE providers">
			<h2>Provider Router</h2>
			<p>ACE uses API-key-backed routing first. Secrets stay in VS Code secret storage and the active provider is selected through HCode ACE settings. Active runtime: <strong>${escapeHtml(dashboard.activeProviderId)}</strong> on <strong>${escapeHtml(dashboard.activeModel)}</strong>.</p>
			<div class="grid">${providerCards}</div>
		</section>

		<section class="section" aria-label="ACE skill packs">
			<h2>Skill Packs</h2>
			<p>These packs shape how ACE decomposes work across HCode tools, the MCP bridge, and future ACP workers.</p>
			<div class="grid">${skillCards}</div>
		</section>

		<section class="section" aria-label="ACE protocols">
			<h2>Protocols</h2>
			<div class="protocol-row">
				<div class="card protocol">
					<h3>MCP Bridge</h3>
					<p>${dashboard.mcpEnabled ? 'Enabled' : 'Disabled'} for external agents and tool consumers. Runtime status: <strong>${dashboard.mcpStatus.isRunning ? 'Running' : 'Offline'}</strong>.</p>
					<pre>${escapeHtml(dashboard.mcpStatus.url)}</pre>
					${mcpActionButton}
					<button id="copy-mcp" class="secondary">Copy MCP URL</button>
				</div>
				<div class="card protocol">
					<h3>ACP Beta</h3>
					<p>${dashboard.acpEnabled ? 'Enabled' : 'Disabled'} as a native ACE orchestration scaffold for short-lived workers and deterministic promotion. Current max workers: <strong>${dashboard.acpMaxWorkers}</strong>.</p>
					<pre>${escapeHtml(buildAcpSpec())}</pre>
					<button id="run-objective-inline">Run ACP Objective</button>
					<button id="copy-acp" class="secondary">Copy ACP Spec</button>
				</div>
				${xbowLoop}
			</div>
		</section>
	</main>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		document.getElementById('configure-provider')?.addEventListener('click', () => vscode.postMessage({ command: 'configureProvider' }));
		document.getElementById('run-prompt')?.addEventListener('click', () => vscode.postMessage({ command: 'runPrompt' }));
		document.getElementById('run-objective')?.addEventListener('click', () => vscode.postMessage({ command: 'runObjective' }));
		document.getElementById('run-objective-inline')?.addEventListener('click', () => vscode.postMessage({ command: 'runObjective' }));
		document.getElementById('copy-mcp')?.addEventListener('click', () => vscode.postMessage({ command: 'copyMcp' }));
		document.getElementById('start-mcp')?.addEventListener('click', () => vscode.postMessage({ command: 'startMcp' }));
		document.getElementById('stop-mcp')?.addEventListener('click', () => vscode.postMessage({ command: 'stopMcp' }));
		document.getElementById('copy-acp')?.addEventListener('click', () => vscode.postMessage({ command: 'copyAcp' }));
		document.getElementById('show-persona')?.addEventListener('click', () => vscode.postMessage({ command: 'showPersona' }));
	</script>
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