/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Skill, SkillCategory, SKILLS } from './skillRegistry';

type SkillNodeData =
	| { kind: 'category'; category: SkillCategory }
	| { kind: 'skill'; skillId: string };

export class SkillNode extends vscode.TreeItem {
	constructor(
		readonly nodeData: SkillNodeData,
		label: string,
		collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
		this.contextValue = nodeData.kind;
	}
}

const CATEGORY_ICONS: Record<SkillCategory, string> = {
	recon: 'radio-tower',
	web: 'globe',
	network: 'plug',
	privesc: 'arrow-up',
	cloud: 'cloud',
	ctf: 'beaker',
	bugbounty: 'bug',
	osint: 'search',
};

const CATEGORY_LABELS: Record<SkillCategory, string> = {
	recon: 'Recon',
	web: 'Web',
	network: 'Network / AD',
	privesc: 'Privilege Escalation',
	cloud: 'Cloud',
	ctf: 'CTF',
	bugbounty: 'Bug Bounty',
	osint: 'OSINT',
};

export class SkillProvider implements vscode.TreeDataProvider<SkillNode> {
	private readonly _onChange = new vscode.EventEmitter<SkillNode | undefined | void>();
	readonly onDidChangeTreeData = this._onChange.event;

	private _filter = '';

	constructor() { }

	refresh(): void { this._onChange.fire(); }

	setFilter(text: string): void {
		this._filter = text.toLowerCase();
		this._onChange.fire();
	}

	getTreeItem(e: SkillNode): vscode.TreeItem { return e; }

	getChildren(element?: SkillNode): SkillNode[] {
		if (!element) { return this._categoryNodes(); }
		if (element.nodeData.kind === 'category') {
			return this._skillNodes(element.nodeData.category);
		}
		return [];
	}

	private _visibleSkills(): Skill[] {
		if (!this._filter) { return SKILLS; }
		return SKILLS.filter(s =>
			s.name.toLowerCase().includes(this._filter) ||
			s.description.toLowerCase().includes(this._filter) ||
			s.methodology.toLowerCase().includes(this._filter) ||
			s.category.includes(this._filter),
		);
	}

	private _categoryNodes(): SkillNode[] {
		const categories: SkillCategory[] = [
			'bugbounty', 'recon', 'web', 'network', 'privesc', 'cloud', 'ctf', 'osint',
		];
		const visible = this._visibleSkills();
		return categories
			.filter(cat => visible.some(s => s.category === cat))
			.map(cat => {
				const count = visible.filter(s => s.category === cat).length;
				const node = new SkillNode(
					{ kind: 'category', category: cat },
					CATEGORY_LABELS[cat],
					vscode.TreeItemCollapsibleState.Expanded,
				);
				node.description = `${count} skill${count !== 1 ? 's' : ''}`;
				node.iconPath = new vscode.ThemeIcon(CATEGORY_ICONS[cat] ?? 'book');
				return node;
			});
	}

	private _skillNodes(category: SkillCategory): SkillNode[] {
		return this._visibleSkills()
			.filter(s => s.category === category)
			.map(skill => {
				const node = new SkillNode(
					{ kind: 'skill', skillId: skill.id },
					skill.name,
					vscode.TreeItemCollapsibleState.None,
				);
				node.description = skill.methodology;
				node.tooltip = new vscode.MarkdownString(
					`**${skill.name}**\n\n${skill.description}\n\n_Source: ${skill.methodology}_\n\n` +
					`**Steps:** ${skill.steps.length}   **Params:** ${skill.params.length}`,
				);
				node.iconPath = new vscode.ThemeIcon('play-circle');
				return node;
			});
	}
}
