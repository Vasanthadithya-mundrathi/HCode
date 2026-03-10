/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BugBountyProgram, Finding, HCodeState, ScopeTarget } from './types';
import { randomUUID } from 'crypto';

const STATE_KEY = 'hcode.bugbounty.state';

export class ProgramManager {
	private _state: HCodeState;
	private readonly _onChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onChange.event;

	constructor(private readonly _ctx: vscode.ExtensionContext) {
		this._state = _ctx.globalState.get<HCodeState>(STATE_KEY) ?? { programs: [] };
	}

	get programs(): BugBountyProgram[] { return this._state.programs; }

	getProgram(id: string): BugBountyProgram | undefined {
		return this._state.programs.find(p => p.id === id);
	}

	getPrograms(): BugBountyProgram[] {
		return this._state.programs;
	}

	async createProgram(input: {
		name: string;
		platform: BugBountyProgram['platform'];
		programUrl?: string;
		active?: boolean;
	}): Promise<BugBountyProgram> {
		const prog: BugBountyProgram = {
			id: randomUUID(),
			name: input.name.trim(),
			platform: input.platform,
			programUrl: input.programUrl?.trim() || undefined,
			inScope: [],
			outOfScope: [],
			rules: [],
			findings: [],
			createdAt: new Date().toISOString(),
			active: input.active ?? true,
		};
		this._state.programs.push(prog);
		await this._save();
		return prog;
	}

	async createScopeTarget(programId: string, target: Omit<ScopeTarget, 'id'>, isInScope: boolean): Promise<ScopeTarget | undefined> {
		const prog = this.getProgram(programId);
		if (!prog) { return undefined; }

		const created: ScopeTarget = {
			id: randomUUID(),
			type: target.type,
			value: target.value.trim(),
			bountyRange: target.bountyRange?.trim() || undefined,
			notes: target.notes?.trim() || undefined,
		};

		if (isInScope) {
			prog.inScope.push(created);
		} else {
			prog.outOfScope.push(created);
		}

		await this._save();
		return created;
	}

	async createFinding(programId: string, finding: Omit<Finding, 'id' | 'createdAt' | 'updatedAt'>): Promise<Finding | undefined> {
		const prog = this.getProgram(programId);
		if (!prog) { return undefined; }

		const now = new Date().toISOString();
		const created: Finding = {
			id: randomUUID(),
			title: finding.title.trim(),
			severity: finding.severity,
			status: finding.status,
			targetId: finding.targetId,
			cweId: finding.cweId?.trim() || undefined,
			cvss: finding.cvss,
			description: finding.description.trim(),
			stepsToReproduce: finding.stepsToReproduce?.trim() || undefined,
			impact: finding.impact?.trim() || undefined,
			reportUrl: finding.reportUrl?.trim() || undefined,
			bountyEarned: finding.bountyEarned,
			createdAt: now,
			updatedAt: now,
		};
		prog.findings.push(created);
		await this._save();
		return created;
	}

	async setFindingStatus(programId: string, findingId: string, status: Finding['status']): Promise<boolean> {
		const prog = this.getProgram(programId);
		if (!prog) { return false; }
		const finding = prog.findings.find(f => f.id === findingId);
		if (!finding) { return false; }

		finding.status = status;
		finding.updatedAt = new Date().toISOString();
		await this._save();
		return true;
	}

	// ── Programs ────────────────────────────────────────────────────────────

	async addProgram(): Promise<BugBountyProgram | undefined> {
		const name = await vscode.window.showInputBox({ prompt: 'Program name (e.g. "Example Corp VDP")', validateInput: (v: string) => v.trim() ? undefined : 'Required' });
		if (!name) { return undefined; }

		const platforms = ['HackerOne', 'Bugcrowd', 'Intigriti', 'Synack', 'YesWeHack', 'OpenBug', 'Private', 'Other'];
		const platform = await vscode.window.showQuickPick(platforms, { placeHolder: 'Platform' }) as BugBountyProgram['platform'] | undefined;
		if (!platform) { return undefined; }

		const programUrl = await vscode.window.showInputBox({ prompt: 'Program URL (optional)', placeHolder: 'https://hackerone.com/example' });

		return this.createProgram({
			name,
			platform,
			programUrl: programUrl ?? undefined,
		});
	}

	async removeProgram(id: string): Promise<void> {
		const prog = this.getProgram(id);
		if (!prog) { return; }
		const confirm = await vscode.window.showWarningMessage(`Delete program "${prog.name}" and all its findings?`, { modal: true }, 'Delete');
		if (confirm !== 'Delete') { return; }
		this._state.programs = this._state.programs.filter(p => p.id !== id);
		await this._save();
	}

	// ── Scope targets ────────────────────────────────────────────────────────

	async addScopeTarget(programId: string, isInScope: boolean): Promise<ScopeTarget | undefined> {
		const prog = this.getProgram(programId);
		if (!prog) { return undefined; }

		const typeOptions = ['domain', 'url', 'ip', 'cidr', 'mobile-app', 'api', 'other'];
		const type = await vscode.window.showQuickPick(typeOptions, { placeHolder: 'Target type' }) as ScopeTarget['type'] | undefined;
		if (!type) { return undefined; }

		const value = await vscode.window.showInputBox({
			prompt: `Target value (e.g. *.example.com, 192.168.1.0/24)`,
			validateInput: (v: string) => v.trim() ? undefined : 'Required',
		});
		if (!value) { return undefined; }

		const bountyRange = isInScope ? await vscode.window.showInputBox({ prompt: 'Bounty range (optional, e.g. $100 - $5000)' }) : undefined;

		return this.createScopeTarget(programId, {
			type,
			value: value.trim(),
			bountyRange: bountyRange?.trim() || undefined,
		}, isInScope);
	}

	async removeScopeTarget(programId: string, targetId: string): Promise<void> {
		const prog = this.getProgram(programId);
		if (!prog) { return; }
		prog.inScope = prog.inScope.filter(t => t.id !== targetId);
		prog.outOfScope = prog.outOfScope.filter(t => t.id !== targetId);
		await this._save();
	}

	async addRule(programId: string): Promise<void> {
		const prog = this.getProgram(programId);
		if (!prog) { return; }
		const rule = await vscode.window.showInputBox({ prompt: 'Rule of engagement (e.g. "No automated scanning on prod")' });
		if (!rule?.trim()) { return; }
		prog.rules.push(rule.trim());
		await this._save();
	}

	// ── Findings ─────────────────────────────────────────────────────────────

	async addFinding(programId: string): Promise<Finding | undefined> {
		const prog = this.getProgram(programId);
		if (!prog) { return undefined; }

		const title = await vscode.window.showInputBox({ prompt: 'Finding title', validateInput: (v: string) => v.trim() ? undefined : 'Required' });
		if (!title) { return undefined; }

		const severities = ['critical', 'high', 'medium', 'low', 'info', 'n/a'];
		const severity = await vscode.window.showQuickPick(severities, { placeHolder: 'Severity' }) as Finding['severity'] | undefined;
		if (!severity) { return undefined; }

		const targetPicks = prog.inScope.map(t => ({ label: t.value, description: t.type, id: t.id }));
		let targetId: string | undefined;
		if (targetPicks.length > 0) {
			const picked = await vscode.window.showQuickPick([{ label: '(no specific target)', id: '' }, ...targetPicks], { placeHolder: 'Affected target (optional)' });
			targetId = picked?.id || undefined;
		}

		const cweId = await vscode.window.showInputBox({ prompt: 'CWE ID (optional, e.g. CWE-79)', placeHolder: 'CWE-' });
		const description = await vscode.window.showInputBox({ prompt: 'Short description' }) ?? '';

		return this.createFinding(programId, {
			title: title.trim(),
			severity,
			status: 'new',
			targetId: targetId || undefined,
			cweId: cweId?.trim() || undefined,
			description: description.trim(),
		});
	}

	async updateFindingStatus(programId: string, findingId: string): Promise<void> {
		const prog = this.getProgram(programId);
		if (!prog) { return; }
		const finding = prog.findings.find(f => f.id === findingId);
		if (!finding) { return; }

		const statuses = ['new', 'in-progress', 'reported', 'triaged', 'accepted', 'resolved', 'duplicate', 'n/a'];
		const status = await vscode.window.showQuickPick(statuses, { placeHolder: `Current: ${finding.status}` }) as Finding['status'] | undefined;
		if (!status) { return; }

		finding.status = status;
		finding.updatedAt = new Date().toISOString();

		if (status === 'accepted' || status === 'resolved') {
			const bounty = await vscode.window.showInputBox({ prompt: 'Bounty earned ($, optional)' });
			if (bounty && !isNaN(Number(bounty))) {
				finding.bountyEarned = Number(bounty);
			}
			const url = await vscode.window.showInputBox({ prompt: 'Report URL (optional)' });
			if (url?.trim()) { finding.reportUrl = url.trim(); }
		}
		await this._save();
	}

	async removeFinding(programId: string, findingId: string): Promise<void> {
		const prog = this.getProgram(programId);
		if (!prog) { return; }
		prog.findings = prog.findings.filter(f => f.id !== findingId);
		await this._save();
	}

	// ── Report export ────────────────────────────────────────────────────────

	exportMarkdownReport(programId: string): string {
		const prog = this.getProgram(programId);
		if (!prog) { return ''; }

		const sev = (s: string) => ({ critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪', 'n/a': '⬛' })[s] ?? s;
		const totalBounty = prog.findings.reduce((s, f) => s + (f.bountyEarned ?? 0), 0);

		const lines: string[] = [
			`# Bug Bounty Report — ${prog.name}`,
			``,
			`**Platform:** ${prog.platform}  `,
			prog.programUrl ? `**URL:** ${prog.programUrl}  ` : '',
			`**Generated:** ${new Date().toLocaleString()}  `,
			`**Total Bounty Earned:** $${totalBounty}`,
			``,
			`## Scope`,
			`### In Scope`,
			...prog.inScope.map(t => `- \`${t.value}\` *(${t.type})* ${t.bountyRange ? `— ${t.bountyRange}` : ''}`),
			`### Out of Scope`,
			...prog.outOfScope.map(t => `- \`${t.value}\` *(${t.type})*`),
			``,
			`## Rules of Engagement`,
			...prog.rules.map((r, i) => `${i + 1}. ${r}`),
			``,
			`## Findings (${prog.findings.length})`,
			``,
			`| # | Title | Severity | Status | Target | CWE | Bounty |`,
			`|---|-------|----------|--------|--------|-----|--------|`,
			...prog.findings.map((f, i) => {
				const target = prog.inScope.find(t => t.id === f.targetId)?.value ?? '—';
				return `| ${i + 1} | ${f.title} | ${sev(f.severity)} ${f.severity} | ${f.status} | ${target} | ${f.cweId ?? '—'} | ${f.bountyEarned != null ? `$${f.bountyEarned}` : '—'} |`;
			}),
			``,
			`---`,
			...prog.findings.map((f, i) => [
				`### ${i + 1}. ${f.title}`,
				``,
				`**Severity:** ${sev(f.severity)} ${f.severity} | **Status:** ${f.status} | **CWE:** ${f.cweId ?? 'N/A'}`,
				f.cvss != null ? `**CVSS:** ${f.cvss}` : '',
				``,
				`**Description:** ${f.description}`,
				f.stepsToReproduce ? `\n**Steps to Reproduce:**\n${f.stepsToReproduce}` : '',
				f.impact ? `\n**Impact:** ${f.impact}` : '',
				f.reportUrl ? `\n**Report:** ${f.reportUrl}` : '',
				``,
			].filter(Boolean).join('\n')),
		].filter(l => l !== null && l !== undefined);
		return lines.join('\n');
	}

	private async _save(): Promise<void> {
		await this._ctx.globalState.update(STATE_KEY, this._state);
		this._onChange.fire();
	}
}
