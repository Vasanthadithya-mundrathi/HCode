/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Vasantha Adithya. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Mirrored API types from hcode-bugbounty, hcode-devices, hcode-tools.
 * We use `any` here because we load extensions at runtime via getExtension().exports
 * and compiling against the actual extension sources from here would create a cycle.
 * In practice the shapes are exactly as defined below.
 */

// ─── Bug Bounty ──────────────────────────────────────────────────────────────

export interface BugBountyProgram {
	id: string;
	name: string;
	platform: string;
	programUrl?: string;
	inScope: ScopeTarget[];
	outOfScope: ScopeTarget[];
	rules: string[];
	findings: Finding[];
	createdAt: string;
	active: boolean;
}

export interface ScopeTarget {
	id: string;
	type: 'domain' | 'url' | 'ip' | 'cidr' | 'mobile-app' | 'api' | 'other';
	value: string;
	bountyRange?: string;
	notes?: string;
}

export interface Finding {
	id: string;
	title: string;
	severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'n/a';
	status: 'new' | 'in-progress' | 'reported' | 'triaged' | 'accepted' | 'resolved' | 'duplicate' | 'n/a';
	targetId?: string;
	description: string;
	stepsToReproduce?: string;
	impact?: string;
	cweId?: string;
	cvss?: number;
	reportUrl?: string;
	bountyEarned?: number;
	createdAt: string;
	updatedAt: string;
}

export interface IHCodeBugBountyAPI {
	getPrograms(): BugBountyProgram[];
	createProgram(input: { name: string; platform: string; programUrl?: string; active?: boolean }): Promise<BugBountyProgram>;
	createScopeTarget(programId: string, target: Omit<ScopeTarget, 'id'>, isInScope: boolean): Promise<ScopeTarget | undefined>;
	createFinding(programId: string, finding: Omit<Finding, 'id' | 'createdAt' | 'updatedAt'>): Promise<Finding | undefined>;
	setFindingStatus(programId: string, findingId: string, status: Finding['status']): Promise<boolean>;
	exportMarkdownReport(programId: string): string;
}

// ─── Devices ─────────────────────────────────────────────────────────────────

export interface SSHDevice {
	id: string;
	label: string;
	host: string;
	port: number;
	user: string;
	keyPath: string;
	tags: string[];
	notes: string;
}

export interface IHCodeDevicesAPI {
	manager: {
		devices: SSHDevice[];
	};
	getDevices(): SSHDevice[];
	createDevice(device: SSHDevice): Promise<SSHDevice>;
	deleteDevice(id: string): Promise<boolean>;
	bootstrapAgentEnvironment(deviceId: string, profileId?: 'linux-apt' | 'macos-brew' | 'windows-powershell'): unknown;
	connect(deviceId: string): unknown;
	runCommand(deviceId: string, command: string): unknown;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export interface SecurityTool {
	id: string;
	name: string;
	binary: string;
	description: string;
	category: string;
	source: string;
	presets: Array<{ label: string; args: string }>;
	installHint: string;
}

export interface IHCodeToolsAPI {
	tools: SecurityTool[];
	runToolHeadless(toolId: string, args: string): unknown;
	refreshAvailability(): Promise<Map<string, boolean>>;
	getAvailability(): Map<string, boolean>;
}

// ─── Skills ──────────────────────────────────────────────────────────────────

export interface IHCodeSkillsAPI {
	listSkills(): Array<{
		id: string;
		name: string;
		category: string;
		description: string;
		methodology: string;
		stepCount: number;
	}>;
	getSkill(id: string): {
		id: string;
		name: string;
		category: string;
		description: string;
		methodology: string;
		params: Array<{ key: string; label: string; description: string; required: boolean; defaultValue?: string }>;
		steps: Array<{ toolId: string; argsTemplate: string; description: string; optional?: boolean; onDevice?: boolean }>;
	} | undefined;
	getPlaybook(id: string): string | undefined;
	runSkill(id: string, params: Record<string, string>, deviceId?: string): Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function hasFunction(value: Record<string, unknown>, key: string): boolean {
	return typeof value[key] === 'function';
}

export function isHCodeBugBountyAPI(value: unknown): value is IHCodeBugBountyAPI {
	if (!isObject(value)) {
		return false;
	}

	return hasFunction(value, 'getPrograms')
		&& hasFunction(value, 'createProgram')
		&& hasFunction(value, 'createScopeTarget')
		&& hasFunction(value, 'createFinding')
		&& hasFunction(value, 'setFindingStatus')
		&& hasFunction(value, 'exportMarkdownReport');
}

export function isHCodeDevicesAPI(value: unknown): value is IHCodeDevicesAPI {
	if (!isObject(value)) {
		return false;
	}

	return isObject(value.manager)
		&& Array.isArray(value.manager.devices)
		&& hasFunction(value, 'getDevices')
		&& hasFunction(value, 'createDevice')
		&& hasFunction(value, 'deleteDevice')
		&& hasFunction(value, 'bootstrapAgentEnvironment')
		&& hasFunction(value, 'connect')
		&& hasFunction(value, 'runCommand');
}

export function isHCodeToolsAPI(value: unknown): value is IHCodeToolsAPI {
	if (!isObject(value)) {
		return false;
	}

	return Array.isArray(value.tools)
		&& hasFunction(value, 'runToolHeadless')
		&& hasFunction(value, 'refreshAvailability')
		&& hasFunction(value, 'getAvailability');
}

export function isHCodeSkillsAPI(value: unknown): value is IHCodeSkillsAPI {
	if (!isObject(value)) {
		return false;
	}

	return hasFunction(value, 'listSkills')
		&& hasFunction(value, 'getSkill')
		&& hasFunction(value, 'getPlaybook')
		&& hasFunction(value, 'runSkill');
}
