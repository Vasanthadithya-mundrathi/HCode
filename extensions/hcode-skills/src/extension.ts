/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SKILLS, Skill } from './skillRegistry';
import { SkillProvider, SkillNode } from './skillProvider';
import { generatePlaybook, runSkillInteractive, SkillDevicesAPI, SkillRunner } from './skillRunner';

// ─── Headless API (consumed by hcode-mcp-server) ─────────────────────────────

export interface HCodeSkillsAPI {
	/** List all available skills */
	listSkills(): Array<{ id: string; name: string; category: string; description: string; methodology: string; stepCount: number }>;
	/** Get a skill by id */
	getSkill(id: string): Skill | undefined;
	/** Get the markdown playbook for a skill */
	getPlaybook(id: string): string | undefined;
	/** Run a skill with pre-supplied params (non-interactive) */
	runSkill(id: string, params: Record<string, string>, deviceId?: string): Promise<void>;
}

interface DeviceQuickPickItem extends vscode.QuickPickItem {
	id: string;
}

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): HCodeSkillsAPI {
	const provider = new SkillProvider();

	// Register tree view
	const treeView = vscode.window.createTreeView('hcode.skills.tree', {
		treeDataProvider: provider,
		showCollapseAll: true,
	});
	context.subscriptions.push(treeView);

	// ── Commands ──────────────────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.skills.refresh', () => {
			provider.refresh();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.skills.run', async (node?: SkillNode) => {
			const skill = await _resolveSkill(node);
			if (!skill) { return; }
			await runSkillInteractive(skill);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.skills.showPlaybook', async (node?: SkillNode) => {
			const skill = await _resolveSkill(node);
			if (!skill) { return; }
			const md = generatePlaybook(skill);
			const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
			await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.skills.runOnDevice', async (node?: SkillNode) => {
			const skill = await _resolveSkill(node);
			if (!skill) { return; }
			const devicesApi = await loadDevicesApi();
			if (!devicesApi) {
				vscode.window.showWarningMessage('HCode Devices is required for on-device skill execution.');
				return;
			}

			const deviceItems: DeviceQuickPickItem[] = devicesApi.manager.devices.map(device => ({
				label: device.label,
				description: `${device.user}@${device.host}:${device.port}`,
				id: device.id,
			}));
			if (deviceItems.length === 0) {
				vscode.window.showWarningMessage('No SSH devices configured. Add one in HCode Devices first.');
				return;
			}

			const device = await vscode.window.showQuickPick(deviceItems, { placeHolder: 'Select device for on-device skill steps' });
			if (!device) { return; }

			const params = await SkillRunner.promptParams(skill);
			if (!params) { return; }

			await SkillRunner.run(skill, { params, deviceId: device.id, devicesApi });
		}),
	);

	// ── Status bar ────────────────────────────────────────────────────────────

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
	statusBar.text = `$(book) ${SKILLS.length} Skills`;
	statusBar.tooltip = 'HCode Skills — hacking methodology playbooks';
	statusBar.command = 'hcode.skills.refresh';
	statusBar.show();
	context.subscriptions.push(statusBar);

	// ── Headless API ──────────────────────────────────────────────────────────

	const api: HCodeSkillsAPI = {
		listSkills: () => SKILLS.map(s => ({
			id: s.id,
			name: s.name,
			category: s.category,
			description: s.description,
			methodology: s.methodology,
			stepCount: s.steps.length,
		})),

		getSkill: (id: string) => SKILLS.find(s => s.id === id),

		getPlaybook: (id: string) => {
			const skill = SKILLS.find(s => s.id === id);
			return skill ? generatePlaybook(skill) : undefined;
		},

		runSkill: async (id: string, params: Record<string, string>, deviceId?: string) => {
			const skill = SKILLS.find(s => s.id === id);
			if (!skill) {
				vscode.window.showErrorMessage(`HCode Skills: skill '${id}' not found.`);
				return;
			}
			const devicesApi = deviceId ? await loadDevicesApi() : undefined;
			await SkillRunner.run(skill, { params, deviceId, devicesApi });
		},
	};

	return api;
}

export function deactivate(): void { /* nothing */ }

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function _resolveSkill(node?: SkillNode): Promise<Skill | undefined> {
	if (node && node.nodeData.kind === 'skill') {
		return SKILLS.find(s => s.id === (node.nodeData as { kind: 'skill'; skillId: string }).skillId);
	}

	// Quick pick fallback
	const items = SKILLS.map(s => ({
		label: s.name,
		description: s.category,
		detail: s.description,
		id: s.id,
	}));

	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select a skill to run',
		matchOnDescription: true,
		matchOnDetail: true,
	});

	return pick ? SKILLS.find(s => s.id === pick.id) : undefined;
}

async function loadDevicesApi(): Promise<(SkillDevicesAPI & { manager: { devices: Array<{ id: string; label: string; user: string; host: string; port: number }> } }) | undefined> {
	const ext = vscode.extensions.getExtension<SkillDevicesAPI & { manager: { devices: Array<{ id: string; label: string; user: string; host: string; port: number }> } }>('hcode.hcode-devices');
	if (!ext) {
		return undefined;
	}
	if (!ext.isActive) {
		await ext.activate();
	}
	return ext.exports;
}
