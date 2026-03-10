/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProgramManager } from './programManager';
import { BugBountyNode, BugBountyProvider } from './bugBountyProvider';

/** Public API consumed by hcode-mcp-server and any AI agent extension */
export interface HCodeBugBountyAPI {
	manager: ProgramManager;
	getPrograms: () => ReturnType<ProgramManager['getPrograms']>;
	createProgram: (input: { name: string; platform: string; programUrl?: string; active?: boolean }) => Promise<ReturnType<ProgramManager['getProgram']> extends infer _ ? import('./types').BugBountyProgram : never>;
	createScopeTarget: (programId: string, target: Omit<import('./types').ScopeTarget, 'id'>, isInScope: boolean) => Promise<import('./types').ScopeTarget | undefined>;
	createFinding: (programId: string, finding: Omit<import('./types').Finding, 'id' | 'createdAt' | 'updatedAt'>) => Promise<import('./types').Finding | undefined>;
	setFindingStatus: (programId: string, findingId: string, status: import('./types').Finding['status']) => Promise<boolean>;
	exportMarkdownReport: (programId: string) => string;
}

export function activate(context: vscode.ExtensionContext): HCodeBugBountyAPI {
	const manager = new ProgramManager(context);
	const provider = new BugBountyProvider(manager);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hcode.bugbounty.programs', provider),
	);

	// ── Program commands ──────────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.bugbounty.addProgram', async () => {
			const prog = await manager.addProgram();
			if (prog) { vscode.window.showInformationMessage(`HCode: Program "${prog.name}" created.`); }
		}),
		vscode.commands.registerCommand('hcode.bugbounty.removeProgram', async (node: BugBountyNode) => {
			const id = node?.nodeData.kind === 'program' ? node.nodeData.programId : undefined;
			if (!id) { return; }
			await manager.removeProgram(id);
		}),
	);

	// ── Scope commands ────────────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.bugbounty.addInScope', async (node: BugBountyNode) => {
			if (!node || node.nodeData.kind !== 'section') { return; }
			await manager.addScopeTarget(node.nodeData.programId, true);
		}),
		vscode.commands.registerCommand('hcode.bugbounty.addOutOfScope', async (node: BugBountyNode) => {
			if (!node || node.nodeData.kind !== 'section') { return; }
			await manager.addScopeTarget(node.nodeData.programId, false);
		}),
		vscode.commands.registerCommand('hcode.bugbounty.removeScopeTarget', async (node: BugBountyNode) => {
			if (!node || node.nodeData.kind !== 'scopeTarget') { return; }
			await manager.removeScopeTarget(node.nodeData.programId, node.nodeData.targetId);
		}),
		vscode.commands.registerCommand('hcode.bugbounty.addRule', async (node: BugBountyNode) => {
			if (!node || node.nodeData.kind !== 'section') { return; }
			await manager.addRule(node.nodeData.programId);
		}),
	);

	// ── Finding commands ──────────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.bugbounty.addFinding', async (node: BugBountyNode) => {
			// Can be called from section node or program node
			let programId: string | undefined;
			if (node?.nodeData.kind === 'section') { programId = node.nodeData.programId; }
			else if (node?.nodeData.kind === 'program') { programId = node.nodeData.programId; }
			else {
				// Fallback: pick from list
				const programs = manager.programs;
				if (programs.length === 0) {
					vscode.window.showWarningMessage('HCode: Create a program first.');
					return;
				}
				const pick = await vscode.window.showQuickPick(programs.map(p => ({ label: p.name, id: p.id })), { placeHolder: 'Select program' });
				programId = pick?.id;
			}
			if (!programId) { return; }
			const finding = await manager.addFinding(programId);
			if (finding) { vscode.window.showInformationMessage(`HCode: Finding "${finding.title}" [${finding.severity}] added.`); }
		}),
		vscode.commands.registerCommand('hcode.bugbounty.updateFindingStatus', async (node: BugBountyNode) => {
			if (!node || node.nodeData.kind !== 'finding') { return; }
			await manager.updateFindingStatus(node.nodeData.programId, node.nodeData.findingId);
		}),
		vscode.commands.registerCommand('hcode.bugbounty.removeFinding', async (node: BugBountyNode) => {
			if (!node || node.nodeData.kind !== 'finding') { return; }
			await manager.removeFinding(node.nodeData.programId, node.nodeData.findingId);
		}),
	);

	// ── Report export ─────────────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.bugbounty.exportReport', async (node: BugBountyNode) => {
			let programId: string | undefined;
			if (node?.nodeData.kind === 'program') {
				programId = node.nodeData.programId;
			} else {
				const programs = manager.programs;
				if (programs.length === 0) { vscode.window.showWarningMessage('HCode: No programs found.'); return; }
				const pick = await vscode.window.showQuickPick(programs.map(p => ({ label: p.name, id: p.id })));
				programId = pick?.id;
			}
			if (!programId) { return; }

			const md = manager.exportMarkdownReport(programId);
			const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
			await vscode.window.showTextDocument(doc, { preview: false });
			vscode.window.showInformationMessage('HCode: Report exported. Save with Ctrl+S / Cmd+S.');
		}),
	);

	// ── Dashboard status bar ──────────────────────────────────────────────────

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
	statusBar.command = 'hcode.bugbounty.addFinding';
	context.subscriptions.push(statusBar);

	function updateStatus(): void {
		const programs = manager.programs;
		const totalFindings = programs.reduce((s, p) => s + p.findings.length, 0);
		const openFindings = programs.reduce((s, p) => s + p.findings.filter(f => f.status === 'new' || f.status === 'in-progress').length, 0);
		statusBar.text = `$(bug) ${openFindings} open`;
		statusBar.tooltip = `HCode Bug Bounty: ${totalFindings} total findings, ${openFindings} open — click to add finding`;
		statusBar.show();
	}

	manager.onDidChange(updateStatus);
	updateStatus();

	// Return public API for consumption by MCP server and AI agent extensions
	return {
		manager,
		getPrograms: () => manager.getPrograms(),
		createProgram: input => manager.createProgram({
			name: input.name,
			platform: input.platform as import('./types').BugBountyProgram['platform'],
			programUrl: input.programUrl,
			active: input.active,
		}),
		createScopeTarget: (programId, target, isInScope) => manager.createScopeTarget(programId, target, isInScope),
		createFinding: (programId, finding) => manager.createFinding(programId, finding),
		setFindingStatus: (programId, findingId, status) => manager.setFindingStatus(programId, findingId, status),
		exportMarkdownReport: programId => manager.exportMarkdownReport(programId),
	};
}

export function deactivate(): void { /* no-op */ }
