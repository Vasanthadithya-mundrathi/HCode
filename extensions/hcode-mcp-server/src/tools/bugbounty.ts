/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Vasantha Adithya. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Finding, IHCodeBugBountyAPI, ScopeTarget } from '../types.js';

export function registerBugBountyTools(server: McpServer, api: IHCodeBugBountyAPI): void {
	// ── List programs ─────────────────────────────────────────────────────────
	server.tool(
		'hcode_bb_list_programs',
		'List all bug bounty programs with their scope, rules, and finding counts.',
		{},
		async () => {
			const programs = api.getPrograms();
			const summary = programs.map(p => ({
				id: p.id,
				name: p.name,
				platform: p.platform,
				programUrl: p.programUrl,
				inScopeTargets: p.inScope.map(t => t.value),
				outOfScopeTargets: p.outOfScope.map(t => t.value),
				rulesOfEngagement: p.rules,
				findingCount: p.findings.length,
				findingsBySeverity: {
					critical: p.findings.filter(f => f.severity === 'critical').length,
					high: p.findings.filter(f => f.severity === 'high').length,
					medium: p.findings.filter(f => f.severity === 'medium').length,
					low: p.findings.filter(f => f.severity === 'low').length,
					info: p.findings.filter(f => f.severity === 'info').length,
				},
				createdAt: p.createdAt,
			}));
			return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
		},
	);

	// ── Add program ───────────────────────────────────────────────────────────
	server.tool(
		'hcode_bb_add_program',
		'Create a new bug bounty program entry.',
		{
			name: z.string().describe('Program name, e.g. "Acme Corp"'),
			platform: z.string().describe('Platform: HackerOne, Bugcrowd, Intigriti, YesWeHack, Cobalt, private, other'),
			url: z.string().describe('Program URL or policy page URL'),
			notes: z.string().optional().describe('Optional notes about the program'),
		},
		async (args: { name: string; platform: string; url: string; notes?: string }) => {
			const program = await api.createProgram({
				name: args.name,
				platform: args.platform,
				programUrl: args.url,
			});
			return { content: [{ type: 'text' as const, text: JSON.stringify(program, null, 2) }] };
		},
	);

	// ── Add scope target ─────────────────────────────────────────────────────
	server.tool(
		'hcode_bb_add_scope_target',
		'Add an in-scope or out-of-scope target to a bug bounty program.',
		{
			programId: z.string().describe('The ID of the program to add the target to'),
			type: z.enum(['domain', 'url', 'ip', 'cidr', 'mobile-app', 'api', 'other']).describe('Target type'),
			value: z.string().describe('Target value, e.g. "*.acme.com" or "192.168.1.0/24"'),
			inScope: z.boolean().describe('true = in scope, false = out of scope'),
			bountyRange: z.string().optional().describe('Optional bounty range for in-scope assets'),
			notes: z.string().optional().describe('Optional notes about this target'),
		},
		async (args: { programId: string; type: ScopeTarget['type']; value: string; inScope: boolean; bountyRange?: string; notes?: string }) => {
			const target = await api.createScopeTarget(args.programId, {
				type: args.type,
				value: args.value,
				bountyRange: args.bountyRange,
				notes: args.notes ?? '',
			}, args.inScope);
			if (!target) {
				return { content: [{ type: 'text' as const, text: `Error: program ${args.programId} not found` }] };
			}
			return { content: [{ type: 'text' as const, text: JSON.stringify(target, null, 2) }] };
		},
	);

	// ── List findings ─────────────────────────────────────────────────────────
	server.tool(
		'hcode_bb_list_findings',
		'List all findings for a bug bounty program, or all findings across all programs.',
		{
			programId: z.string().optional().describe('Program ID to filter by (omit to list all)'),
			severity: z.enum(['critical', 'high', 'medium', 'low', 'info', 'n/a']).optional().describe('Filter by severity'),
			status: z.enum(['new', 'in-progress', 'reported', 'triaged', 'accepted', 'resolved', 'duplicate', 'n/a']).optional().describe('Filter by status'),
		},
		async (args: { programId?: string; severity?: Finding['severity']; status?: Finding['status'] }) => {
			const programs = api.getPrograms();
			let findings = programs.flatMap(p => p.findings);
			if (args.programId) {
				const program = programs.find(p => p.id === args.programId);
				findings = program?.findings ?? [];
			}
			if (args.severity) {
				findings = findings.filter(f => f.severity === args.severity);
			}
			if (args.status) {
				findings = findings.filter(f => f.status === args.status);
			}
			return { content: [{ type: 'text' as const, text: JSON.stringify(findings, null, 2) }] };
		},
	);

	// ── Add finding ───────────────────────────────────────────────────────────
	server.tool(
		'hcode_bb_add_finding',
		'Record a new security finding / vulnerability for a bug bounty program.',
		{
			programId: z.string().describe('The ID of the program this finding belongs to'),
			title: z.string().describe('Short title, e.g. "Reflected XSS in search param"'),
			severity: z.enum(['critical', 'high', 'medium', 'low', 'info', 'n/a']).describe('CVSS-aligned severity'),
			description: z.string().describe('Full finding description including technical details'),
			targetId: z.string().optional().describe('Optional in-scope target id from the program'),
			stepsToReproduce: z.string().optional().describe('Step-by-step reproduction instructions'),
			impact: z.string().optional().describe('Business / security impact statement'),
			cweId: z.string().optional().describe('CWE identifier, e.g. "CWE-79"'),
			cvss: z.number().min(0).max(10).optional().describe('CVSS score (0-10)'),
			reportUrl: z.string().optional().describe('Affected URL or report URL'),
			bountyEarned: z.number().optional().describe('Optional bounty amount already earned'),
		},
		async (args: { programId: string; title: string; severity: Finding['severity']; description: string; targetId?: string; stepsToReproduce?: string; impact?: string; cweId?: string; cvss?: number; reportUrl?: string; bountyEarned?: number }) => {
			const finding = await api.createFinding(args.programId, {
				title: args.title,
				severity: args.severity,
				status: 'new',
				targetId: args.targetId,
				description: args.description,
				stepsToReproduce: args.stepsToReproduce,
				impact: args.impact,
				cweId: args.cweId,
				cvss: args.cvss,
				reportUrl: args.reportUrl,
				bountyEarned: args.bountyEarned,
			});
			if (!finding) {
				return { content: [{ type: 'text' as const, text: `Error: program ${args.programId} not found` }] };
			}
			return { content: [{ type: 'text' as const, text: JSON.stringify(finding, null, 2) }] };
		},
	);

	// ── Update finding status ─────────────────────────────────────────────────
	server.tool(
		'hcode_bb_update_finding_status',
		'Update the status of an existing finding (e.g. draft → submitted → triaged → resolved).',
		{
			programId: z.string().describe('The ID of the parent program'),
			findingId: z.string().describe('The ID of the finding to update'),
			status: z.enum(['new', 'in-progress', 'reported', 'triaged', 'accepted', 'resolved', 'duplicate', 'n/a']).describe('New status'),
		},
		async (args: { programId: string; findingId: string; status: Finding['status'] }) => {
			const ok = await api.setFindingStatus(args.programId, args.findingId, args.status);
			return { content: [{ type: 'text' as const, text: ok ? `Finding ${args.findingId} status updated to ${args.status}` : `Error: finding ${args.findingId} not found` }] };
		},
	);

	// ── Export report ─────────────────────────────────────────────────────────
	server.tool(
		'hcode_bb_export_report',
		'Generate and return a full Markdown bug bounty report for a program including all findings.',
		{
			programId: z.string().describe('The ID of the program to export'),
		},
		async (args: { programId: string }) => {
			const report = api.exportMarkdownReport(args.programId);
			return { content: [{ type: 'text' as const, text: report }] };
		},
	);
}
