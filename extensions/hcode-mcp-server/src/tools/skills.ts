/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IHCodeSkillsAPI } from '../types.js';

/**
 * Register HCode Skills MCP tools — agents can list, inspect, and run named
 * methodology playbooks (OpenClaw-style skills).
 */
export function registerSkillTools(mcp: McpServer, skills: IHCodeSkillsAPI): void {

	// ── hcode_skills_list ─────────────────────────────────────────────────────
	mcp.tool(
		'hcode_skills_list',
		'List all available HCode methodology skills grouped by category. Skills are reusable multi-step attack-chain playbooks (recon, web, network, privesc, cloud, ctf, bugbounty, osint).',
		{
			category: z.string().optional().describe('Filter by category: recon|web|network|privesc|cloud|ctf|bugbounty|osint'),
		},
		async ({ category }: { category?: string }) => {
			let list = skills.listSkills();
			if (category) {
				list = list.filter(s => s.category === category);
			}

			const grouped: Record<string, typeof list> = {};
			for (const s of list) {
				if (!grouped[s.category]) { grouped[s.category] = []; }
				grouped[s.category].push(s);
			}

			const text = Object.entries(grouped).map(([cat, items]) => {
				const header = `## ${cat.toUpperCase()} (${items.length} skills)`;
				const rows = items.map(s =>
					`  • **${s.id}** — ${s.name}\n    ${s.description}\n    Methodology: ${s.methodology} | Steps: ${s.stepCount}`,
				);
				return [header, ...rows].join('\n');
			}).join('\n\n');

			return { content: [{ type: 'text', text: text || 'No skills found.' }] };
		},
	);

	// ── hcode_skills_get_playbook ─────────────────────────────────────────────
	mcp.tool(
		'hcode_skills_get_playbook',
		'Get the full markdown playbook for a skill — shows all steps, required parameters, and methodology source.',
		{
			skillId: z.string().describe('Skill ID from hcode_skills_list'),
		},
		async ({ skillId }: { skillId: string }) => {
			const md = skills.getPlaybook(skillId);
			if (!md) {
				return { content: [{ type: 'text', text: `Skill '${skillId}' not found. Use hcode_skills_list to see available skills.` }] };
			}
			return { content: [{ type: 'text', text: md }] };
		},
	);

	// ── hcode_skills_get_detail ───────────────────────────────────────────────
	mcp.tool(
		'hcode_skills_get_detail',
		'Get structured detail of a skill including all steps and parameter definitions.',
		{
			skillId: z.string().describe('Skill ID'),
		},
		async ({ skillId }: { skillId: string }) => {
			const skill = skills.getSkill(skillId);
			if (!skill) {
				return { content: [{ type: 'text', text: `Skill '${skillId}' not found.` }] };
			}
			const text = JSON.stringify(skill, null, 2);
			return { content: [{ type: 'text', text: text }] };
		},
	);

	// ── hcode_skills_run ──────────────────────────────────────────────────────
	mcp.tool(
		'hcode_skills_run',
		'Run a named HCode skill with supplied parameters. The skill will execute its steps in a VS Code terminal. First call hcode_skills_get_playbook to see what parameters are needed.',
		{
			skillId: z.string().describe('Skill ID from hcode_skills_list (e.g. bb_new_program_recon)'),
			params: z.record(z.string()).describe('Key-value map of skill parameters (e.g. { "domain": "example.com", "output": "./out" })'),
			deviceId: z.string().optional().describe('Optional SSH device id from hcode_devices_list; on-device steps are sent to that device'),
		},
		async ({ skillId, params, deviceId }: { skillId: string; params: Record<string, string>; deviceId?: string }) => {
			const skill = skills.getSkill(skillId);
			if (!skill) {
				return { content: [{ type: 'text', text: `Skill '${skillId}' not found. Use hcode_skills_list first.` }] };
			}

			// Validate required params
			const missing = skill.params
				.filter((p: { key: string; required: boolean; defaultValue?: string }) => p.required && !params[p.key])
				.map((p: { key: string; label: string }) => p.label);

			if (missing.length > 0) {
				return {
					content: [{
						type: 'text',
						text: `Missing required parameters: ${missing.join(', ')}\n\nUse hcode_skills_get_playbook('${skillId}') to see all required parameters.`,
					}],
				};
			}

			await skills.runSkill(skillId, params, deviceId);

			const stepsText = skill.steps
				.map((s: { description: string; toolId: string; optional?: boolean }, i: number) => `  ${i + 1}. [${s.toolId}] ${s.description}${s.optional ? ' (optional)' : ''}`)
				.join('\n');

			return {
				content: [{
					type: 'text',
					text: `✅ Skill '${skill.name}' started in VS Code terminal.\n\nSteps being executed:\n${stepsText}`,
				}],
			};
		},
	);
}
