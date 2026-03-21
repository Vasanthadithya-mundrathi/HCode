/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface AceProviderDefinition {
	id: string;
	label: string;
	description: string;
	endpointHint: string;
	apiKeyLabel: string;
	defaultModel: string;
	capabilities: string[];
	protocols: Array<'api-key' | 'mcp' | 'acp' | 'cli-adapter'>;
}

export interface AceProviderStatus extends AceProviderDefinition {
	isConfigured: boolean;
	isDefault: boolean;
}

export interface AcePersona {
	id: string;
	label: string;
	tagline: string;
	description: string;
	systemPrompt: string;
	operatingModes: string[];
	guardrails: string[];
}

export interface AceSkillPack {
	id: string;
	label: string;
	description: string;
	owner: string;
	tags: string[];
	workflow: string[];
}

export interface AceDashboardModel {
	activeProviderId: string;
	activeModel: string;
	defaultPersonaId: string;
	providers: AceProviderStatus[];
	cliDetected: string[];
	kaliStatus: {
		host: string;
		port: number;
		reachable: boolean;
	};
	integrationExtensions: {
		mcp: boolean;
		tools: boolean;
		skills: boolean;
		devices: boolean;
	};
	personas: AcePersona[];
	skillPacks: AceSkillPack[];
	mcpStatus: AceMcpStatus;
	mcpEnabled: boolean;
	acpEnabled: boolean;
	acpMaxWorkers: number;
	xbowInspiredLoop: boolean;
}

export interface AceMcpStatus {
	isRunning: boolean;
	url: string;
	port: number;
}

export interface AceProviderInvocationRequest {
	prompt: string;
	systemPrompt?: string;
	providerId?: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

export interface AceProviderInvocationResult {
	providerId: string;
	providerLabel: string;
	model: string;
	endpoint: string;
	latencyMs: number;
	text: string;
}

export interface AceAcpTaskPlan {
	title: string;
	objective: string;
	validationHint: string;
}

export interface AceAcpWorkerResult {
	title: string;
	objective: string;
	validationHint: string;
	output: string;
	evidence: string[];
	confidence: 'low' | 'medium' | 'high';
	validation: 'passed' | 'failed';
}

export interface AceAcpRunResult {
	objective: string;
	providerId: string;
	personaId: string;
	plan: AceAcpTaskPlan[];
	workers: AceAcpWorkerResult[];
	summary: string;
}

export interface AceCapability {
	id: string;
	label: string;
	domain: 'ace' | 'mcp' | 'tools' | 'skills' | 'devices' | 'bugbounty';
	command: string;
	requiresExtension?: string;
	available: boolean;
	reason?: string;
}

export interface AceCapabilityModel {
	apiVersion: '1.0';
	generatedAt: string;
	capabilities: AceCapability[];
}
