/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as net from 'net';
import { promisify } from 'util';
import { AceAcpRuntime } from './acpRuntime';
import { acePersonas, getPersona } from './personas';
import { AceProviderRegistry } from './providerRegistry';
import { AceProviderRuntime } from './providerRuntime';
import { aceSkillPacks } from './skillPacks';
import { AceAcpLastRunSummary, AceAcpRunResult, AceCapability, AceCapabilityModel, AceDashboardModel, AceMcpStatus, AceProviderInvocationResult } from './types';

const execFileAsync = promisify(execFile);
const aceAcpLastRunStateKey = 'hcode.ace.acp.lastRunState';

interface HCodeMCPServerApi {
	startServer(): Promise<void>;
	stopServer(): void;
	copyServerUrl(): Promise<void>;
	getStatus(): { isRunning: boolean; port: number; url: string };
}

export interface HCodeACEApi {
	getDashboardModel(): Promise<AceDashboardModel>;
	getAcpSpec(): Promise<string>;
	getCapabilities(): Promise<AceCapabilityModel>;
}

export function activate(context: vscode.ExtensionContext): HCodeACEApi {
	const providerRegistry = new AceProviderRegistry(context.secrets, vscode.workspace);
	const providerRuntime = new AceProviderRuntime(providerRegistry, vscode.workspace);
	const dashboardProvider = new AceDashboardViewProvider(context.extensionUri, providerRegistry, context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(AceDashboardViewProvider.viewId, dashboardProvider),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('hcode.ace') || event.affectsConfiguration('hcode.mcp')) {
				dashboardProvider.refresh();
			}
		}),
		vscode.commands.registerCommand('hcode.ace.openDashboard', async () => {
			await vscode.commands.executeCommand('workbench.view.extension.hcode');
			await vscode.commands.executeCommand('hcode.ace.panel.focus');
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
		vscode.commands.registerCommand('hcode.ace.testProviderConnection', async () => {
			await testProviderConnection(providerRuntime);
			dashboardProvider.refresh();
		}),
		vscode.commands.registerCommand('hcode.ace.runObjective', async () => {
			await runAcpObjective(context, providerRuntime);
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
		vscode.commands.registerCommand('hcode.ace.openModelManager', async () => {
			await openModelManager(providerRegistry);
			dashboardProvider.refresh();
		}),
		vscode.commands.registerCommand('hcode.ace.openSettings', async () => {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'hcode.ace');
		}),
		vscode.commands.registerCommand('hcode.ace.openExtensions', async () => {
			await vscode.commands.executeCommand('workbench.view.extensions');
		}),
		vscode.commands.registerCommand('hcode.ace.openTools', async () => {
			await vscode.commands.executeCommand('workbench.view.extension.hcode');
			await vscode.commands.executeCommand('hcode.tools.refresh');
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
		}),
		vscode.commands.registerCommand('hcode.capabilities.list', async () => getCapabilityModel())
	);

	return {
		getDashboardModel: () => getDashboardModel(context, providerRegistry, providerRuntime),
		getAcpSpec: async () => buildAcpSpec(),
		getCapabilities: () => getCapabilityModel(),
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
		private readonly providerRegistry: AceProviderRegistry,
		private readonly context: vscode.ExtensionContext,
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
				case 'openModelManager':
					await vscode.commands.executeCommand('hcode.ace.openModelManager');
					break;
				case 'openSettings':
					await vscode.commands.executeCommand('hcode.ace.openSettings');
					break;
				case 'openExtensions':
					await vscode.commands.executeCommand('hcode.ace.openExtensions');
					break;
				case 'openTools':
					await vscode.commands.executeCommand('hcode.ace.openTools');
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

		const dashboard = await getDashboardModel(this.context, this.providerRegistry, new AceProviderRuntime(this.providerRegistry, vscode.workspace));
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

	if (!provider.protocols.includes('api-key')) {
		void vscode.window.showInformationMessage(`ACE: ${provider.label} uses local CLI authentication/session. Configure hcode.ace.cliAdapters if needed.`);
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

async function testProviderConnection(providerRuntime: AceProviderRuntime): Promise<void> {
	const aceConfiguration = vscode.workspace.getConfiguration('hcode.ace');
	const providerId = aceConfiguration.get<string>('activeProvider', 'openai');
	const persona = getDefaultPersona();

	try {
		const result = await providerRuntime.invoke({
			providerId,
			systemPrompt: persona.systemPrompt,
			prompt: 'Respond with exactly: HCODE_PROVIDER_OK',
			maxTokens: 64,
			temperature: 0,
		});

		const response = result.text.trim();
		const ok = response.includes('HCODE_PROVIDER_OK');
		if (ok) {
			void vscode.window.showInformationMessage(`ACE: Provider ${result.providerLabel} is connected and responsive.`);
		} else {
			void vscode.window.showWarningMessage(`ACE: Provider responded, but validation token was not exact. Response: ${response.slice(0, 120)}`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		void vscode.window.showErrorMessage(`ACE: Provider connection test failed (${providerId}) - ${message}`);
	}
}

async function runAcpObjective(context: vscode.ExtensionContext, providerRuntime: AceProviderRuntime): Promise<void> {
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
	const normalizedObjective = objective.trim();
	const activeProviderId = vscode.workspace.getConfiguration('hcode.ace').get<string>('activeProvider', 'openai');
	const acpRuntime = new AceAcpRuntime(providerRuntime, vscode.workspace.getConfiguration('hcode.ace').get<number>('acpMaxWorkers', 3));
	const startedAt = new Date();
	const timeoutMs = vscode.workspace.getConfiguration('hcode.ace').get<number>('acpWorkerTimeoutMs', 120000);

	await persistAcpLastRun(context, {
		terminalState: 'running',
		objective: normalizedObjective,
		providerId: activeProviderId,
		personaId: persona.id,
		startedAt: startedAt.toISOString(),
		totalWorkers: 0,
		passedWorkers: 0,
		failedWorkers: 0,
	});

	let result: AceAcpRunResult;
	try {
		result = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'ACE ACP: Running objective plan',
			cancellable: false,
		}, () => withTimeout(acpRuntime.runObjective(normalizedObjective, persona, activeProviderId), timeoutMs));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const finishedAt = new Date();
		const timedOut = message.includes('timed out');

		await persistAcpLastRun(context, {
			terminalState: timedOut ? 'timed_out' : 'failed',
			objective: normalizedObjective,
			providerId: activeProviderId,
			personaId: persona.id,
			startedAt: startedAt.toISOString(),
			finishedAt: finishedAt.toISOString(),
			durationMs: finishedAt.getTime() - startedAt.getTime(),
			totalWorkers: 0,
			passedWorkers: 0,
			failedWorkers: 0,
			errorMessage: message,
		});

		if (timedOut) {
			void vscode.window.showWarningMessage(`ACE ACP timed out after ${timeoutMs} ms.`);
		} else {
			void vscode.window.showErrorMessage(`ACE ACP failed: ${message}`);
		}
		return;
	}

	const document = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content: renderAcpMarkdown(result),
	});
	await vscode.window.showTextDocument(document, { preview: false });

	const passedCount = result.workers.filter(worker => worker.validation === 'passed').length;
	const failedCount = result.workers.length - passedCount;
	const finishedAt = new Date();
	await persistAcpLastRun(context, {
		terminalState: 'completed',
		objective: result.objective,
		providerId: result.providerId,
		personaId: result.personaId,
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
		durationMs: finishedAt.getTime() - startedAt.getTime(),
		totalWorkers: result.workers.length,
		passedWorkers: passedCount,
		failedWorkers: failedCount,
	});

	if (failedCount > 0) {
		void vscode.window.showWarningMessage(`ACE ACP completed with ${passedCount} passed and ${failedCount} failed workers.`);
	} else {
		void vscode.window.showInformationMessage(`ACE ACP completed: ${passedCount} workers passed validation.`);
	}
}

async function getDashboardModel(context: vscode.ExtensionContext, providerRegistry: AceProviderRegistry, providerRuntime: AceProviderRuntime): Promise<AceDashboardModel> {
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
		cliDetected: await detectAvailableCliAdapters(),
		kaliStatus: {
			host: aceConfiguration.get<string>('kaliHost', '192.168.64.6'),
			port: aceConfiguration.get<number>('kaliSshPort', 22),
			reachable: await isTcpReachable(
				aceConfiguration.get<string>('kaliHost', '192.168.64.6'),
				aceConfiguration.get<number>('kaliSshPort', 22),
				1500,
			),
		},
		integrationExtensions: {
			mcp: Boolean(vscode.extensions.getExtension('hcode.hcode-mcp-server')),
			tools: Boolean(vscode.extensions.getExtension('hcode.hcode-tools')),
			skills: Boolean(vscode.extensions.getExtension('hcode.hcode-skills')),
			devices: Boolean(vscode.extensions.getExtension('hcode.hcode-devices')),
		},
		personas: [...acePersonas],
		skillPacks: [...aceSkillPacks],
		mcpStatus: await getMcpStatus(),
		mcpEnabled: aceConfiguration.get<boolean>('enableMCPBridge', true),
		acpEnabled: aceConfiguration.get<boolean>('enableACPBeta', true),
		acpMaxWorkers: aceConfiguration.get<number>('acpMaxWorkers', 3),
		acpLastRun: context.workspaceState.get<AceAcpLastRunSummary>(aceAcpLastRunStateKey),
		xbowInspiredLoop: aceConfiguration.get<boolean>('xbowInspiredLoop', true)
	};
}

async function persistAcpLastRun(context: vscode.ExtensionContext, summary: AceAcpLastRunSummary): Promise<void> {
	await context.workspaceState.update(aceAcpLastRunStateKey, summary);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeoutHandle: NodeJS.Timeout | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutHandle = setTimeout(() => reject(new Error(`ACE ACP timed out after ${timeoutMs} ms`)), timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

async function openModelManager(providerRegistry: AceProviderRegistry): Promise<void> {
	const providerStatuses = await providerRegistry.getStatuses();
	const selected = await vscode.window.showQuickPick(providerStatuses.map(provider => ({
		label: provider.label,
		detail: `${provider.id} | default model: ${provider.defaultModel}`,
		description: provider.isConfigured ? 'Ready' : 'Needs API key',
		provider,
	})), {
		placeHolder: 'Select a provider to manage',
		matchOnDescription: true,
		matchOnDetail: true,
	});

	if (!selected) {
		return;
	}

	const provider = selected.provider;
	const actions: Array<{ label: string; id: string }> = [
		{ label: 'Set as Active Provider', id: 'setActiveProvider' },
		{ label: 'Set Model Override', id: 'setModel' },
		{ label: 'Clear Model Override', id: 'clearModel' },
	];

	if (provider.protocols.includes('api-key')) {
		actions.push({ label: 'Configure API Key', id: 'setKey' });
		actions.push({ label: 'Clear API Key', id: 'clearKey' });
	}

	const action = await vscode.window.showQuickPick(actions, { placeHolder: `Manage ${provider.label}` });
	if (!action) {
		return;
	}

	const aceConfiguration = vscode.workspace.getConfiguration('hcode.ace');
	if (action.id === 'setActiveProvider') {
		await aceConfiguration.update('activeProvider', provider.id, vscode.ConfigurationTarget.Workspace);
		void vscode.window.showInformationMessage(`ACE: Active provider set to ${provider.label}.`);
		return;
	}

	if (action.id === 'setModel') {
		const overrides = aceConfiguration.get<Record<string, string>>('providerModelOverrides', {});

		const modelPick = await vscode.window.showQuickPick([
			...(provider.recommendedModels ?? []).map(modelId => ({
				label: modelId,
				description: modelId === provider.defaultModel ? 'default' : 'recommended',
				modelId,
			})),
			{
				label: '$(pencil) Custom model ID...',
				description: 'Enter manually',
				modelId: '__custom__',
			},
		], {
			placeHolder: `Select model override for ${provider.label}`,
			matchOnDescription: true,
		});

		if (!modelPick) {
			return;
		}

		let model = modelPick.modelId;
		if (modelPick.modelId === '__custom__') {
			const customModel = await vscode.window.showInputBox({
				prompt: `Set model override for ${provider.label}`,
				value: overrides[provider.id] ?? provider.defaultModel,
				ignoreFocusOut: true,
				validateInput: value => value.trim() ? undefined : 'Model is required',
			});
			if (!customModel) {
				return;
			}
			model = customModel.trim();
		}

		overrides[provider.id] = model.trim();
		await aceConfiguration.update('providerModelOverrides', overrides, vscode.ConfigurationTarget.Workspace);
		void vscode.window.showInformationMessage(`ACE: Model override saved for ${provider.label}.`);
		return;
	}

	if (action.id === 'clearModel') {
		const overrides = { ...aceConfiguration.get<Record<string, string>>('providerModelOverrides', {}) };
		delete overrides[provider.id];
		await aceConfiguration.update('providerModelOverrides', overrides, vscode.ConfigurationTarget.Workspace);
		void vscode.window.showInformationMessage(`ACE: Cleared model override for ${provider.label}.`);
		return;
	}

	if (action.id === 'setKey') {
		const apiKey = await vscode.window.showInputBox({
			prompt: provider.apiKeyLabel,
			placeHolder: provider.endpointHint,
			ignoreFocusOut: true,
			password: true,
			validateInput: value => value.trim() ? undefined : 'API key is required',
		});
		if (!apiKey) {
			return;
		}
		await providerRegistry.setApiKey(provider.id, apiKey.trim());
		void vscode.window.showInformationMessage(`ACE: Stored secret for ${provider.label}.`);
		return;
	}

	if (action.id === 'clearKey') {
		await providerRegistry.clearApiKey(provider.id);
		void vscode.window.showInformationMessage(`ACE: Cleared secret for ${provider.label}.`);
	}
}

async function detectAvailableCliAdapters(): Promise<string[]> {
	const candidates = ['gemini', 'qwen', 'opencode'];
	const detected: string[] = [];
	for (const candidate of candidates) {
		if (await isCommandAvailable(candidate)) {
			detected.push(candidate);
		}
	}
	return detected;
}

async function isCommandAvailable(command: string): Promise<boolean> {
	const lookup = process.platform === 'win32' ? 'where' : 'which';
	try {
		await execFileAsync(lookup, [command]);
		return true;
	} catch {
		return false;
	}
}

async function isTcpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
	return new Promise(resolve => {
		const socket = net.createConnection({ host, port });
		let settled = false;

		const finalize = (value: boolean) => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			resolve(value);
		};

		socket.setTimeout(timeoutMs);
		socket.once('connect', () => finalize(true));
		socket.once('timeout', () => finalize(false));
		socket.once('error', () => finalize(false));
	});
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

async function getCapabilityModel(): Promise<AceCapabilityModel> {
	const knownCommands = new Set(await vscode.commands.getCommands(true));
	const capabilitySeeds: Array<Omit<AceCapability, 'available'>> = [
		{ id: 'ace.prompt', label: 'ACE Prompt Execution', domain: 'ace', command: 'hcode.ace.runPrompt' },
		{ id: 'ace.objective', label: 'ACE Objective Runner', domain: 'ace', command: 'hcode.ace.runObjective' },
		{ id: 'mcp.start', label: 'MCP Server Start', domain: 'mcp', command: 'hcode.mcp.startServer', requiresExtension: 'hcode.hcode-mcp-server' },
		{ id: 'mcp.stop', label: 'MCP Server Stop', domain: 'mcp', command: 'hcode.mcp.stopServer', requiresExtension: 'hcode.hcode-mcp-server' },
		{ id: 'tools.run', label: 'Security Tool Runner', domain: 'tools', command: 'hcode.tools.run', requiresExtension: 'hcode.hcode-tools' },
		{ id: 'tools.install', label: 'One-Click Tool Install', domain: 'tools', command: 'hcode.tools.install', requiresExtension: 'hcode.hcode-tools' },
		{ id: 'skills.run', label: 'Skill Pack Runner', domain: 'skills', command: 'hcode.skills.run', requiresExtension: 'hcode.hcode-skills' },
		{ id: 'devices.command', label: 'Remote Device Command', domain: 'devices', command: 'hcode.devices.runCommand', requiresExtension: 'hcode.hcode-devices' },
		{ id: 'bugbounty.addFinding', label: 'Bug Bounty Finding Capture', domain: 'bugbounty', command: 'hcode.bugbounty.addFinding', requiresExtension: 'hcode.hcode-bugbounty' },
	];

	const resolved = capabilitySeeds.map(capability => {
		const extensionMissing = capability.requiresExtension && !vscode.extensions.getExtension(capability.requiresExtension);
		const commandMissing = !knownCommands.has(capability.command);
		const available = !extensionMissing && !commandMissing;

		let reason: string | undefined;
		if (extensionMissing) {
			reason = `Missing extension: ${capability.requiresExtension}`;
		} else if (commandMissing) {
			reason = `Command not registered: ${capability.command}`;
		}

		return {
			...capability,
			available,
			reason,
		};
	});

	return {
		apiVersion: '1.0',
		generatedAt: new Date().toISOString(),
		capabilities: resolved,
	};
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
	const acpLastRun = dashboard.acpLastRun;
	const acpStatusClass = acpLastRun?.terminalState === 'completed'
		? 'configured'
		: acpLastRun?.terminalState === 'running'
			? 'pending'
			: acpLastRun
				? 'failed'
				: 'pending';
	const acpStatusLabel = acpLastRun
		? acpLastRun.terminalState === 'timed_out'
			? 'Timed Out'
			: acpLastRun.terminalState === 'failed'
				? 'Failed'
				: acpLastRun.terminalState === 'running'
					? 'Running'
					: 'Completed'
		: 'No Runs Yet';
	const acpLastRunDetails = acpLastRun
		? `${acpLastRun.objective}\nState: ${acpStatusLabel}\nStarted: ${new Date(acpLastRun.startedAt).toLocaleString()}${acpLastRun.finishedAt ? `\nFinished: ${new Date(acpLastRun.finishedAt).toLocaleString()}` : ''}${typeof acpLastRun.durationMs === 'number' ? `\nDuration: ${acpLastRun.durationMs} ms` : ''}\nWorkers: ${acpLastRun.passedWorkers}/${acpLastRun.totalWorkers} passed${acpLastRun.errorMessage ? `\nError: ${acpLastRun.errorMessage}` : ''}`
		: 'Run an ACP objective to record terminal run state and timings.';
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
			--bg: var(--vscode-sideBar-background);
			--panel: var(--vscode-editorWidget-background);
			--panel-alt: var(--vscode-input-background);
			--border: var(--vscode-panel-border);
			--text: var(--vscode-foreground);
			--muted: var(--vscode-descriptionForeground);
			--accent-a: var(--vscode-button-background);
			--accent-b: var(--vscode-button-hoverBackground);
			--ok: var(--vscode-testing-iconPassed, #2ea043);
			--warn: var(--vscode-testing-iconQueued, #bf8700);
		}

		body {
			margin: 0;
			padding: 16px;
			font-family: var(--vscode-font-family);
			background: var(--bg);
			color: var(--text);
		}

		main {
			display: grid;
			gap: 16px;
		}

		.hero,
		.card,
		.section {
			background: var(--panel);
			border: 1px solid var(--border);
			border-radius: 10px;
			box-shadow: none;
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
			border: 1px solid var(--border);
			background: var(--panel-alt);
		}

		.pill.configured {
			color: var(--ok);
		}

		.pill.pending {
			color: var(--warn);
		}

		.pill.failed {
			color: var(--vscode-errorForeground);
		}

		.provider.default {
			border-color: var(--vscode-focusBorder);
		}

		button {
			border: 0;
			border-radius: 6px;
			padding: 10px 12px;
			font: inherit;
			font-weight: 600;
			cursor: pointer;
			color: var(--vscode-button-foreground);
			background: var(--accent-a);
		}

		button:hover {
			background: var(--accent-b);
		}

		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: 1px solid var(--vscode-button-border, var(--border));
		}

		button.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
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
			background: var(--vscode-textCodeBlock-background);
			padding: 12px;
			border-radius: 6px;
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
				<button id="open-model-manager">Model Manager</button>
				<button id="run-prompt">Run Prompt</button>
				<button id="run-objective">Run Objective</button>
				<button id="show-persona" class="secondary">Show Persona Prompt</button>
				<button id="open-tools" class="secondary">Open Tools</button>
				<button id="open-settings" class="secondary">Open Settings</button>
				<button id="open-extensions" class="secondary">Open Extensions</button>
			</div>
		</section>

		<section class="section" aria-label="ACE integration status">
			<h2>Integration Status</h2>
			<div class="grid">
				<div class="card">
					<div class="card-title-row"><h3>MCP Bridge</h3><span class="pill ${dashboard.mcpStatus.isRunning ? 'configured' : 'pending'}">${dashboard.mcpStatus.isRunning ? 'Live' : 'Offline'}</span></div>
					<p>${escapeHtml(dashboard.mcpStatus.url)}</p>
				</div>
				<div class="card">
					<div class="card-title-row"><h3>CLI Adapters</h3><span class="pill ${dashboard.cliDetected.length ? 'configured' : 'pending'}">${dashboard.cliDetected.length ? 'Detected' : 'Missing'}</span></div>
					<p>${escapeHtml(dashboard.cliDetected.length ? dashboard.cliDetected.join(', ') : 'No CLI adapters detected.')}</p>
				</div>
				<div class="card">
					<div class="card-title-row"><h3>Kali SSH</h3><span class="pill ${dashboard.kaliStatus.reachable ? 'configured' : 'pending'}">${dashboard.kaliStatus.reachable ? 'Reachable' : 'Unreachable'}</span></div>
					<p>${escapeHtml(`${dashboard.kaliStatus.host}:${dashboard.kaliStatus.port}`)}</p>
				</div>
				<div class="card">
					<div class="card-title-row"><h3>HCode Integrations</h3><span class="pill ${(dashboard.integrationExtensions.mcp && dashboard.integrationExtensions.tools && dashboard.integrationExtensions.skills && dashboard.integrationExtensions.devices) ? 'configured' : 'pending'}">Extension Checks</span></div>
					<p>MCP: ${dashboard.integrationExtensions.mcp ? 'OK' : 'Missing'} | Tools: ${dashboard.integrationExtensions.tools ? 'OK' : 'Missing'} | Skills: ${dashboard.integrationExtensions.skills ? 'OK' : 'Missing'} | Devices: ${dashboard.integrationExtensions.devices ? 'OK' : 'Missing'}</p>
				</div>
				<div class="card">
					<div class="card-title-row"><h3>ACP Last Run</h3><span class="pill ${acpStatusClass}">${acpStatusLabel}</span></div>
					<p>${escapeHtml(acpLastRunDetails)}</p>
				</div>
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
		document.getElementById('open-model-manager')?.addEventListener('click', () => vscode.postMessage({ command: 'openModelManager' }));
		document.getElementById('run-prompt')?.addEventListener('click', () => vscode.postMessage({ command: 'runPrompt' }));
		document.getElementById('run-objective')?.addEventListener('click', () => vscode.postMessage({ command: 'runObjective' }));
		document.getElementById('run-objective-inline')?.addEventListener('click', () => vscode.postMessage({ command: 'runObjective' }));
		document.getElementById('copy-mcp')?.addEventListener('click', () => vscode.postMessage({ command: 'copyMcp' }));
		document.getElementById('start-mcp')?.addEventListener('click', () => vscode.postMessage({ command: 'startMcp' }));
		document.getElementById('stop-mcp')?.addEventListener('click', () => vscode.postMessage({ command: 'stopMcp' }));
		document.getElementById('copy-acp')?.addEventListener('click', () => vscode.postMessage({ command: 'copyAcp' }));
		document.getElementById('show-persona')?.addEventListener('click', () => vscode.postMessage({ command: 'showPersona' }));
		document.getElementById('open-tools')?.addEventListener('click', () => vscode.postMessage({ command: 'openTools' }));
		document.getElementById('open-settings')?.addEventListener('click', () => vscode.postMessage({ command: 'openSettings' }));
		document.getElementById('open-extensions')?.addEventListener('click', () => vscode.postMessage({ command: 'openExtensions' }));
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
