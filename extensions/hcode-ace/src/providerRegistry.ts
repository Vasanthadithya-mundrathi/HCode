/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AceProviderDefinition, AceProviderStatus } from './types';

const providerDefinitions: readonly AceProviderDefinition[] = [
	{
		id: 'openai',
		label: 'OpenAI',
		description: 'General frontier model provider for reasoning, coding, and orchestration.',
		endpointHint: 'https://api.openai.com',
		apiKeyLabel: 'OpenAI API Key',
		defaultModel: 'gpt-4.1-mini',
		capabilities: ['chat', 'reasoning', 'tool-calling', 'embeddings'],
		protocols: ['api-key', 'acp']
	},
	{
		id: 'anthropic',
		label: 'Anthropic',
		description: 'Strong long-context reasoning provider for agent planning and policy-heavy workflows.',
		endpointHint: 'https://api.anthropic.com',
		apiKeyLabel: 'Anthropic API Key',
		defaultModel: 'claude-3-7-sonnet-latest',
		capabilities: ['chat', 'reasoning', 'long-context'],
		protocols: ['api-key', 'acp']
	},
	{
		id: 'google-gemini',
		label: 'Google Gemini',
		description: 'Large-context multimodal provider useful for research-heavy and artifact-heavy runs.',
		endpointHint: 'https://generativelanguage.googleapis.com',
		apiKeyLabel: 'Gemini API Key',
		defaultModel: 'gemini-2.0-flash',
		capabilities: ['chat', 'reasoning', 'multimodal'],
		protocols: ['api-key', 'acp']
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		description: 'Broker provider for switching among multiple hosted models through one API key.',
		endpointHint: 'https://openrouter.ai/api',
		apiKeyLabel: 'OpenRouter API Key',
		defaultModel: 'openai/gpt-4o-mini',
		capabilities: ['routing', 'model-broker'],
		protocols: ['api-key', 'acp']
	},
	{
		id: 'azure-openai',
		label: 'Azure OpenAI',
		description: 'Enterprise-hosted OpenAI deployment for regulated teams and managed tenancy.',
		endpointHint: 'https://<resource>.openai.azure.com',
		apiKeyLabel: 'Azure OpenAI API Key',
		defaultModel: 'deployment-required',
		capabilities: ['chat', 'reasoning', 'enterprise'],
		protocols: ['api-key', 'acp']
	},
	{
		id: 'qwen-compatible',
		label: 'Qwen Compatible',
		description: 'Generic OpenAI-compatible endpoint for Qwen-hosted or self-hosted deployments.',
		endpointHint: 'https://<host>/v1',
		apiKeyLabel: 'Qwen-Compatible API Key',
		defaultModel: 'qwen-plus',
		capabilities: ['chat', 'reasoning', 'openai-compatible'],
		protocols: ['api-key', 'acp']
	},
	{
		id: 'ollama',
		label: 'Ollama',
		description: 'Local model endpoint for offline routing and lab-grade experimentation.',
		endpointHint: 'http://localhost:11434',
		apiKeyLabel: 'Ollama Token (optional)',
		defaultModel: 'llama3.2',
		capabilities: ['local-models', 'offline-routing'],
		protocols: ['api-key', 'acp', 'cli-adapter']
	}
];

function getSecretKey(providerId: string): string {
	return `hcode.ace.provider.${providerId}.apiKey`;
}

export class AceProviderRegistry {
	constructor(
		private readonly secrets: vscode.SecretStorage,
		private readonly configurationService: typeof vscode.workspace
	) { }

	getDefinitions(): readonly AceProviderDefinition[] {
		return providerDefinitions;
	}

	async getStatuses(): Promise<AceProviderStatus[]> {
		const activeProvider = this.configurationService.getConfiguration('hcode.ace').get<string>('activeProvider', 'openai');
		const statuses = await Promise.all(providerDefinitions.map(async provider => ({
			...provider,
			isConfigured: Boolean(await this.secrets.get(getSecretKey(provider.id))),
			isDefault: provider.id === activeProvider
		})));
		return statuses;
	}

	async setApiKey(providerId: string, value: string): Promise<void> {
		await this.secrets.store(getSecretKey(providerId), value);
	}

	async clearApiKey(providerId: string): Promise<void> {
		await this.secrets.delete(getSecretKey(providerId));
	}

	async getApiKey(providerId: string): Promise<string | undefined> {
		return this.secrets.get(getSecretKey(providerId));
	}

	getProvider(providerId: string): AceProviderDefinition | undefined {
		return providerDefinitions.find(provider => provider.id === providerId);
	}
}