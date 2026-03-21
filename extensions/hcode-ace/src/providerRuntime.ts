/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { AceProviderRegistry } from './providerRegistry';
import { AceProviderDefinition, AceProviderInvocationRequest, AceProviderInvocationResult } from './types';

interface ProviderRuntimeConfig {
	provider: AceProviderDefinition;
	providerId: string;
	apiKey?: string;
	endpoint: string;
	model: string;
	timeoutMs: number;
	azureDeployment?: string;
	azureApiVersion: string;
}

interface CliAdapterConfig {
	command: string;
	args: string[];
	passViaStdin: boolean;
	timeoutMs: number;
	env: Record<string, string>;
}

export class AceProviderRuntime {
	constructor(
		private readonly providerRegistry: AceProviderRegistry,
		private readonly configurationService: typeof vscode.workspace,
	) { }

	async invoke(request: AceProviderInvocationRequest): Promise<AceProviderInvocationResult> {
		const config = await this.resolveConfig(request.providerId, request.model);
		const startedAt = Date.now();
		const text = await this.invokeProvider(config, request);
		return {
			providerId: config.providerId,
			providerLabel: config.provider.label,
			model: config.model,
			endpoint: config.endpoint,
			latencyMs: Date.now() - startedAt,
			text,
		};
	}

	async getActiveModel(providerId?: string): Promise<string> {
		const aceConfiguration = this.configurationService.getConfiguration('hcode.ace');
		const resolvedProviderId = providerId ?? aceConfiguration.get<string>('activeProvider', 'openai');
		const provider = this.providerRegistry.getProvider(resolvedProviderId);
		if (!provider) {
			throw new Error(`ACE provider '${resolvedProviderId}' is not registered.`);
		}

		const modelOverrides = aceConfiguration.get<Record<string, string>>('providerModelOverrides', {});
		const activeModel = aceConfiguration.get<string>('activeModel', '').trim();
		return (modelOverrides[resolvedProviderId] ?? activeModel ?? provider.defaultModel).trim() || provider.defaultModel;
	}

	private async resolveConfig(providerId?: string, explicitModel?: string): Promise<ProviderRuntimeConfig> {
		const aceConfiguration = this.configurationService.getConfiguration('hcode.ace');
		const resolvedProviderId = providerId ?? aceConfiguration.get<string>('activeProvider', 'openai');
		const provider = this.providerRegistry.getProvider(resolvedProviderId);
		if (!provider) {
			throw new Error(`ACE provider '${resolvedProviderId}' is not registered.`);
		}

		const endpointOverrides = aceConfiguration.get<Record<string, string>>('providerEndpointOverrides', {});
		const modelOverrides = aceConfiguration.get<Record<string, string>>('providerModelOverrides', {});
		const activeModel = aceConfiguration.get<string>('activeModel', '').trim();
		const endpoint = (endpointOverrides[resolvedProviderId] ?? provider.endpointHint).trim();
		const model = (explicitModel ?? modelOverrides[resolvedProviderId] ?? activeModel ?? provider.defaultModel).trim();
		const timeoutMs = aceConfiguration.get<number>('requestTimeoutMs', 45000);
		const azureDeployment = aceConfiguration.get<string>('azureOpenAIDeployment', '').trim();
		const azureApiVersion = aceConfiguration.get<string>('azureOpenAIApiVersion', '2024-10-21').trim();

		if (endpoint.includes('<')) {
			throw new Error(`ACE provider '${provider.label}' needs a real endpoint override before it can run.`);
		}

		if (!model || model === 'deployment-required') {
			throw new Error(`ACE provider '${provider.label}' needs a valid model or deployment configured before it can run.`);
		}

		const apiKey = await this.providerRegistry.getApiKey(resolvedProviderId);
		const requiresApiKey = provider.protocols.includes('api-key');
		if (requiresApiKey && !apiKey && resolvedProviderId !== 'ollama') {
			throw new Error(`ACE provider '${provider.label}' is not configured. Add its API key first.`);
		}

		if (resolvedProviderId === 'azure-openai' && !azureDeployment) {
			throw new Error('ACE Azure OpenAI runtime requires hcode.ace.azureOpenAIDeployment to be set.');
		}

		return {
			provider,
			providerId: resolvedProviderId,
			apiKey,
			endpoint,
			model,
			timeoutMs,
			azureDeployment,
			azureApiVersion,
		};
	}

	private async invokeProvider(config: ProviderRuntimeConfig, request: AceProviderInvocationRequest): Promise<string> {
		switch (config.providerId) {
			case 'gemini-cli':
			case 'qwen-cli':
			case 'opencode-cli':
				return this.invokeCliAdapter(config, request);
			case 'anthropic':
				return this.invokeAnthropic(config, request);
			case 'google-gemini':
				return this.invokeGemini(config, request);
			case 'ollama':
				return this.invokeOllama(config, request);
			case 'azure-openai':
				return this.invokeAzureOpenAI(config, request);
			case 'openrouter':
				return this.invokeOpenAICompatible(config, request, '/v1/chat/completions', {
					'HTTP-Referer': 'https://github.com/vasanthadithya/HCode',
					'X-Title': 'HCode ACE',
				});
			case 'qwen-compatible':
				return this.invokeOpenAICompatible(config, request, '/chat/completions');
			case 'openai':
			default:
				return this.invokeOpenAICompatible(config, request, '/v1/chat/completions');
		}
	}

	private async invokeCliAdapter(config: ProviderRuntimeConfig, request: AceProviderInvocationRequest): Promise<string> {
		const adapterConfig = this.resolveCliAdapterConfig(config.providerId, request, config.timeoutMs);
		const args = adapterConfig.args.map(arg => arg
			.replace(/\{prompt\}/g, request.prompt)
			.replace(/\{systemPrompt\}/g, request.systemPrompt ?? '')
		);

		return new Promise<string>((resolve, reject) => {
			const child = spawn(adapterConfig.command, args, {
				env: { ...process.env, ...adapterConfig.env },
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';
			const timeout = setTimeout(() => {
				child.kill('SIGTERM');
				reject(new Error(`ACE CLI adapter '${config.provider.label}' timed out after ${adapterConfig.timeoutMs} ms.`));
			}, adapterConfig.timeoutMs);

			child.stdout.on('data', chunk => {
				stdout += chunk.toString();
			});

			child.stderr.on('data', chunk => {
				stderr += chunk.toString();
			});

			child.on('error', error => {
				clearTimeout(timeout);
				reject(new Error(`ACE CLI adapter '${config.provider.label}' failed to start: ${error.message}`));
			});

			child.on('close', code => {
				clearTimeout(timeout);
				if (code !== 0) {
					reject(new Error(`ACE CLI adapter '${config.provider.label}' exited with code ${code}. ${stderr.trim()}`.trim()));
					return;
				}

				const text = stdout.trim();
				if (!text) {
					reject(new Error(`ACE CLI adapter '${config.provider.label}' returned empty output. ${stderr.trim()}`.trim()));
					return;
				}

				resolve(text);
			});

			const input = `${request.systemPrompt ? `${request.systemPrompt}\n\n` : ''}${request.prompt}`;
			if (adapterConfig.passViaStdin) {
				child.stdin.write(input);
			}
			child.stdin.end();
		});
	}

	private resolveCliAdapterConfig(providerId: string, request: AceProviderInvocationRequest, fallbackTimeoutMs: number): CliAdapterConfig {
		const aceConfiguration = this.configurationService.getConfiguration('hcode.ace');
		const adapters = aceConfiguration.get<Record<string, {
			command?: string;
			args?: string[];
			passViaStdin?: boolean;
			timeoutMs?: number;
			env?: Record<string, string>;
		}>>('cliAdapters', {});

		const configured = adapters[providerId];
		if (!configured?.command?.trim()) {
			throw new Error(`ACE CLI adapter '${providerId}' is not configured. Set hcode.ace.cliAdapters.${providerId}.command.`);
		}

		const args = Array.isArray(configured.args) ? configured.args : [];
		const hasPromptPlaceholder = args.some(arg => arg.includes('{prompt}'));
		const finalArgs = hasPromptPlaceholder ? args : [...args, request.prompt];

		return {
			command: configured.command.trim(),
			args: finalArgs,
			passViaStdin: Boolean(configured.passViaStdin),
			timeoutMs: configured.timeoutMs && configured.timeoutMs > 0 ? configured.timeoutMs : fallbackTimeoutMs,
			env: configured.env ?? {},
		};
	}

	private async invokeOpenAICompatible(config: ProviderRuntimeConfig, request: AceProviderInvocationRequest, path: string, extraHeaders: Record<string, string> = {}): Promise<string> {
		const response = await this.postJson(
			this.joinEndpoint(config.endpoint, path),
			{
				'Authorization': `Bearer ${config.apiKey}`,
				'Content-Type': 'application/json',
				...extraHeaders,
			},
			{
				model: config.model,
				messages: this.buildMessages(request),
				temperature: request.temperature ?? 0.2,
				max_tokens: request.maxTokens ?? 1200,
			},
			config.timeoutMs,
		);

		return response?.choices?.[0]?.message?.content?.trim() ?? this.failMalformedResponse(config.provider.label);
	}

	private async invokeAzureOpenAI(config: ProviderRuntimeConfig, request: AceProviderInvocationRequest): Promise<string> {
		const path = `/openai/deployments/${encodeURIComponent(config.azureDeployment ?? '')}/chat/completions?api-version=${encodeURIComponent(config.azureApiVersion)}`;
		const response = await this.postJson(
			this.joinEndpoint(config.endpoint, path),
			{
				'api-key': config.apiKey ?? '',
				'Content-Type': 'application/json',
			},
			{
				messages: this.buildMessages(request),
				temperature: request.temperature ?? 0.2,
				max_tokens: request.maxTokens ?? 1200,
			},
			config.timeoutMs,
		);

		return response?.choices?.[0]?.message?.content?.trim() ?? this.failMalformedResponse(config.provider.label);
	}

	private async invokeAnthropic(config: ProviderRuntimeConfig, request: AceProviderInvocationRequest): Promise<string> {
		const response = await this.postJson(
			this.joinEndpoint(config.endpoint, '/v1/messages'),
			{
				'x-api-key': config.apiKey ?? '',
				'anthropic-version': '2023-06-01',
				'Content-Type': 'application/json',
			},
			{
				model: config.model,
				system: request.systemPrompt ?? '',
				max_tokens: request.maxTokens ?? 1200,
				messages: [{ role: 'user', content: request.prompt }],
			},
			config.timeoutMs,
		);

		const content = Array.isArray(response?.content) ? response.content : [];
		const textPart = content.find((part: { type?: string; text?: string }) => typeof part?.text === 'string');
		return textPart?.text?.trim() ?? this.failMalformedResponse(config.provider.label);
	}

	private async invokeGemini(config: ProviderRuntimeConfig, request: AceProviderInvocationRequest): Promise<string> {
		const keyParam = encodeURIComponent(config.apiKey ?? '');
		const response = await this.postJson(
			this.joinEndpoint(config.endpoint, `/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${keyParam}`),
			{
				'Content-Type': 'application/json',
			},
			{
				systemInstruction: request.systemPrompt ? { parts: [{ text: request.systemPrompt }] } : undefined,
				contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
				generationConfig: {
					temperature: request.temperature ?? 0.2,
					maxOutputTokens: request.maxTokens ?? 1200,
				},
			},
			config.timeoutMs,
		);

		const parts = response?.candidates?.[0]?.content?.parts;
		const text = Array.isArray(parts)
			? parts.map((part: { text?: string }) => part.text ?? '').join('').trim()
			: '';
		return text || this.failMalformedResponse(config.provider.label);
	}

	private async invokeOllama(config: ProviderRuntimeConfig, request: AceProviderInvocationRequest): Promise<string> {
		const response = await this.postJson(
			this.joinEndpoint(config.endpoint, '/api/chat'),
			{
				'Content-Type': 'application/json',
				...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
			},
			{
				model: config.model,
				messages: this.buildMessages(request),
				stream: false,
			},
			config.timeoutMs,
		);

		return response?.message?.content?.trim() ?? this.failMalformedResponse(config.provider.label);
	}

	private buildMessages(request: AceProviderInvocationRequest): Array<{ role: 'system' | 'user'; content: string }> {
		const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
		if (request.systemPrompt) {
			messages.push({ role: 'system', content: request.systemPrompt });
		}
		messages.push({ role: 'user', content: request.prompt });
		return messages;
	}

	private async postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<any> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`ACE provider request failed (${response.status}): ${errorText || response.statusText}`);
			}

			return response.json();
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`ACE provider request timed out after ${timeoutMs} ms.`);
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	private joinEndpoint(endpoint: string, path: string): string {
		return `${endpoint.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
	}

	private failMalformedResponse(providerLabel: string): never {
		throw new Error(`ACE provider '${providerLabel}' returned an unexpected response shape.`);
	}
}
