/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BugBountyProgram, Finding, ScopeTarget } from './types';
import { ProgramManager } from './programManager';

// ── Tree node kinds ───────────────────────────────────────────────────────────

export type NodeKind =
	| { kind: 'program'; programId: string }
	| { kind: 'section'; programId: string; section: 'inScope' | 'outOfScope' | 'rules' | 'findings' }
	| { kind: 'scopeTarget'; programId: string; targetId: string; inScope: boolean }
	| { kind: 'rule'; programId: string; index: number }
	| { kind: 'finding'; programId: string; findingId: string }
	| { kind: 'empty'; label: string };

export class BugBountyNode extends vscode.TreeItem {
	constructor(
		public readonly nodeData: NodeKind,
		label: string,
		collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
	}
}

// ── Main tree provider ────────────────────────────────────────────────────────

export class BugBountyProvider implements vscode.TreeDataProvider<BugBountyNode> {
	private readonly _onChange = new vscode.EventEmitter<BugBountyNode | undefined | void>();
	readonly onDidChangeTreeData = this._onChange.event;

	constructor(private readonly _manager: ProgramManager) {
		_manager.onDidChange(() => this._onChange.fire());
	}

	refresh(): void { this._onChange.fire(); }

	getTreeItem(element: BugBountyNode): vscode.TreeItem { return element; }

	getChildren(element?: BugBountyNode): BugBountyNode[] {
		if (!element) { return this._rootNodes(); }

		const d = element.nodeData;

		if (d.kind === 'program') { return this._programChildren(d.programId); }
		if (d.kind === 'section') { return this._sectionChildren(d.programId, d.section); }
		return [];
	}

	// ── Root: programs ────────────────────────────────────────────────────────

	private _rootNodes(): BugBountyNode[] {
		const programs = this._manager.programs;
		if (programs.length === 0) {
			const n = new BugBountyNode({ kind: 'empty', label: 'No programs. Click + to add.' }, 'No programs yet', vscode.TreeItemCollapsibleState.None);
			n.description = 'Click + to add a program';
			return [n];
		}
		return programs.map(p => {
			const node = new BugBountyNode(
				{ kind: 'program', programId: p.id },
				p.name,
				vscode.TreeItemCollapsibleState.Collapsed,
			);
			node.description = p.platform;
			node.tooltip = new vscode.MarkdownString(`**${p.name}**\nPlatform: ${p.platform}\nFindings: ${p.findings.length}\nIn scope: ${p.inScope.length}`);
			node.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor(p.active ? 'debugConsole.infoForeground' : 'disabledForeground'));
			node.contextValue = 'hcode.program';
			return node;
		});
	}

	// ── Program children: sections ────────────────────────────────────────────

	private _programChildren(programId: string): BugBountyNode[] {
		const prog = this._manager.getProgram(programId);
		if (!prog) { return []; }

		const sections: Array<{ section: 'inScope' | 'outOfScope' | 'rules' | 'findings'; label: string; icon: string; count: number }> = [
			{ section: 'inScope', label: 'In Scope', icon: 'check', count: prog.inScope.length },
			{ section: 'outOfScope', label: 'Out of Scope', icon: 'circle-slash', count: prog.outOfScope.length },
			{ section: 'rules', label: 'Rules of Engagement', icon: 'law', count: prog.rules.length },
			{ section: 'findings', label: 'Findings', icon: 'bug', count: prog.findings.length },
		];

		return sections.map(s => {
			const node = new BugBountyNode(
				{ kind: 'section', programId, section: s.section },
				s.label,
				s.count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
			);
			node.description = `${s.count}`;
			node.iconPath = new vscode.ThemeIcon(s.icon);
			node.contextValue = `hcode.section.${s.section}`;
			return node;
		});
	}

	// ── Section children ──────────────────────────────────────────────────────

	private _sectionChildren(programId: string, section: 'inScope' | 'outOfScope' | 'rules' | 'findings'): BugBountyNode[] {
		const prog = this._manager.getProgram(programId);
		if (!prog) { return []; }

		if (section === 'inScope') { return this._scopeNodes(prog, prog.inScope, true); }
		if (section === 'outOfScope') { return this._scopeNodes(prog, prog.outOfScope, false); }
		if (section === 'rules') { return this._ruleNodes(prog); }
		if (section === 'findings') { return this._findingNodes(prog); }
		return [];
	}

	private _scopeNodes(prog: BugBountyProgram, targets: ScopeTarget[], inScope: boolean): BugBountyNode[] {
		if (targets.length === 0) { return [this._empty('No targets defined')]; }
		return targets.map(t => {
			const node = new BugBountyNode(
				{ kind: 'scopeTarget', programId: prog.id, targetId: t.id, inScope },
				t.value,
				vscode.TreeItemCollapsibleState.None,
			);
			node.description = t.type + (t.bountyRange ? ` — ${t.bountyRange}` : '');
			node.tooltip = t.notes ?? t.value;
			node.iconPath = new vscode.ThemeIcon(this._iconForType(t.type));
			node.contextValue = 'hcode.scopeTarget';
			return node;
		});
	}

	private _ruleNodes(prog: BugBountyProgram): BugBountyNode[] {
		if (prog.rules.length === 0) { return [this._empty('No rules defined')]; }
		return prog.rules.map((r, i) => {
			const node = new BugBountyNode(
				{ kind: 'rule', programId: prog.id, index: i },
				r,
				vscode.TreeItemCollapsibleState.None,
			);
			node.iconPath = new vscode.ThemeIcon('info');
			node.contextValue = 'hcode.rule';
			return node;
		});
	}

	private _findingNodes(prog: BugBountyProgram): BugBountyNode[] {
		if (prog.findings.length === 0) { return [this._empty('No findings yet')]; }

		const order: Finding['severity'][] = ['critical', 'high', 'medium', 'low', 'info', 'n/a'];
		const sorted = [...prog.findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

		return sorted.map(f => {
			const target = prog.inScope.find(t => t.id === f.targetId)?.value;
			const node = new BugBountyNode(
				{ kind: 'finding', programId: prog.id, findingId: f.id },
				f.title,
				vscode.TreeItemCollapsibleState.None,
			);
			node.description = `[${f.severity}] ${f.status}${target ? ` — ${target}` : ''}`;
			node.tooltip = new vscode.MarkdownString(
				`**${f.title}**\n\nSeverity: ${f.severity} | Status: ${f.status}\n\n${f.description}`,
			);
			node.iconPath = new vscode.ThemeIcon('bug', new vscode.ThemeColor(this._colorForSeverity(f.severity)));
			node.contextValue = 'hcode.finding';
			return node;
		});
	}

	private _empty(label: string): BugBountyNode {
		const n = new BugBountyNode({ kind: 'empty', label }, label, vscode.TreeItemCollapsibleState.None);
		n.iconPath = new vscode.ThemeIcon('dash');
		return n;
	}

	private _iconForType(type: ScopeTarget['type']): string {
		const map: Record<string, string> = {
			domain: 'globe', url: 'link', ip: 'server', cidr: 'server',
			'mobile-app': 'device-mobile', api: 'symbol-interface', other: 'circle',
		};
		return map[type] ?? 'circle';
	}

	private _colorForSeverity(s: string): string {
		const map: Record<string, string> = {
			critical: 'charts.red', high: 'charts.orange',
			medium: 'charts.yellow', low: 'charts.blue',
			info: 'charts.foreground', 'n/a': 'disabledForeground',
		};
		return map[s] ?? 'charts.foreground';
	}
}
