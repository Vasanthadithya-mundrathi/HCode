/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { AceSkillPack } from './types';

export const aceSkillPacks: readonly AceSkillPack[] = [
	{
		id: 'ace-foundation',
		label: 'ACE Foundation',
		description: 'Core skill pack for HCode-first workflows spanning recon, validation, devices, and reports.',
		owner: 'HCode',
		tags: ['recon', 'validation', 'reporting'],
		workflow: ['surface map', 'evidence gather', 'validate', 'summarize']
	},
	{
		id: 'ace-mcp-bridge',
		label: 'MCP Bridge Pack',
		description: 'Treat local HCode capabilities as tools for external agents through the MCP server.',
		owner: 'HCode MCP',
		tags: ['mcp', 'external-agents', 'tool-routing'],
		workflow: ['load tools', 'delegate tasks', 'collect outputs', 'review evidence']
	},
	{
		id: 'ace-acp-beta',
		label: 'ACP Beta Pack',
		description: 'Short-lived worker orchestration for bounded task execution with deterministic validation inspired by modern autonomous security platforms.',
		owner: 'ACE Control Plane',
		tags: ['acp', 'beta', 'orchestration'],
		workflow: ['decompose objective', 'spawn short workers', 'validate deterministically', 'promote surviving evidence']
	},
	{
		id: 'ace-provider-router',
		label: 'Provider Router Pack',
		description: 'Route work between API-key providers and local model endpoints without changing operator workflows.',
		owner: 'ACE',
		tags: ['providers', 'routing', 'api-keys'],
		workflow: ['choose provider', 'check capability fit', 'dispatch task', 'record provenance']
	}
];