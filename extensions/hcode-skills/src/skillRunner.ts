/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Skill, SkillParam } from './skillRegistry';

export interface SkillDevicesAPI {
	runCommand(deviceId: string, command: string): unknown;
}

export interface SkillRunOptions {
	/** Param values keyed by SkillParam.key */
	params: Record<string, string>;
	/** Device id to run on-device steps — if undefined, device steps run locally */
	deviceId?: string;
	/** Optional devices API used for on-device steps */
	devicesApi?: SkillDevicesAPI;
}

/**
 * SkillRunner executes a Skill's steps sequentially.
 * Each step spawns a VS Code terminal command (local) or sends text to an SSH terminal (device).
 */
export class SkillRunner {

	/**
	 * Prompt the user for all required/optional parameters.
	 * Returns undefined if the user cancels.
	 */
	static async promptParams(skill: Skill): Promise<Record<string, string> | undefined> {
		const result: Record<string, string> = {};

		for (const param of skill.params) {
			const value = await vscode.window.showInputBox({
				title: `Skill: ${skill.name}`,
				prompt: param.description,
				placeHolder: param.defaultValue ?? (param.required ? `Required — enter ${param.label}` : `Optional — leave blank to skip`),
				value: param.defaultValue ?? '',
				ignoreFocusOut: true,
			});

			if (value === undefined) {
				// User pressed Escape
				return undefined;
			}

			if (value.trim() === '' && param.required) {
				vscode.window.showErrorMessage(`Parameter '${param.label}' is required.`);
				return undefined;
			}

			result[param.key] = value.trim() !== '' ? value.trim() : (param.defaultValue ?? '');
		}

		return result;
	}

	/**
	 * Execute the skill by running each step in a VS Code terminal.
	 */
	static async run(skill: Skill, options: SkillRunOptions): Promise<void> {
		const terminalName = `HCode: ${skill.name}`;

		// Reuse or create a terminal for this skill
		let terminal = vscode.window.terminals.find((t: vscode.Terminal) => t.name === terminalName);
		if (!terminal) {
			terminal = vscode.window.createTerminal({ name: terminalName });
		}
		terminal.show(false);

		// Announce the playbook
		terminal.sendText(`echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`, true);
		terminal.sendText(`echo "🔥 HCode Skill: ${skill.name}"`, true);
		terminal.sendText(`echo "📖 Methodology: ${skill.methodology}"`, true);
		terminal.sendText(`echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`, true);

		// Create output directory if any param named 'output' was provided
		const outputDir = options.params['output'];
		if (outputDir) {
			terminal.sendText(`mkdir -p "${outputDir}"`, true);
		}

		// Execute each step
		for (let i = 0; i < skill.steps.length; i++) {
			const step = skill.steps[i];
			const cmd = SkillRunner._buildCommand(step.argsTemplate, options.params);
			const binary = SkillRunner._binaryForStep(step.toolId);
			const fullCmd = step.toolId !== 'shell' ? `${binary} ${cmd}`.trim() : cmd;

			if (step.onDevice && options.deviceId && options.devicesApi) {
				options.devicesApi.runCommand(options.deviceId, fullCmd);
				terminal.sendText(`echo "[remote] ${fullCmd}"`, true);
				continue;
			}

			terminal.sendText(`echo ""`, true);
			terminal.sendText(`echo "[Step ${i + 1}/${skill.steps.length}] ${step.description}"`, true);

			if (step.optional) {
				// Wrap optional steps in command existence check
				terminal.sendText(
					`if command -v ${binary} &>/dev/null; then ${fullCmd}; else echo "  ⚠ Skipping: '${binary}' not installed"; fi`,
					true,
				);
			} else {
				terminal.sendText(fullCmd, true);
			}
		}

		terminal.sendText(`echo ""`, true);
		terminal.sendText(`echo "✅ Skill '${skill.name}' complete."`, true);

		vscode.window.showInformationMessage(`Running skill: ${skill.name}`, 'Show Terminal').then((sel: string | undefined) => {
			if (sel === 'Show Terminal') { terminal!.show(); }
		});
	}

	/** Replace {placeholders} in a template string with actual param values. */
	private static _buildCommand(template: string, params: Record<string, string>): string {
		return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? key);
	}

	private static _binaryForStep(toolId: string): string {
		const aliases: Record<string, string> = {
			awscli: 'aws',
			corscanner: 'python3',
			linpeas: 'linpeas.sh',
			netcat: 'nc',
			pspy: 'pspy64',
			radare2: 'r2',
			secretsdump: 'impacket-secretsdump',
		};
		return aliases[toolId] ?? toolId;
	}
}

/**
 * Collect params for a skill and run it.
 * Returns false if cancelled.
 */
export async function runSkillInteractive(skill: Skill): Promise<boolean> {
	const params = await SkillRunner.promptParams(skill);
	if (!params) { return false; }

	await SkillRunner.run(skill, { params });
	return true;
}

/**
 * Generate a markdown playbook document for a skill.
 */
export function generatePlaybook(skill: Skill): string {
	const header = [
		`# ${skill.name}`,
		``,
		`**Category:** ${skill.category}  `,
		`**Methodology:** ${skill.methodology}`,
		``,
		`## Description`,
		``,
		skill.description,
		``,
		`## Parameters`,
		``,
		...skill.params.map((p: SkillParam) =>
			`- **\`{${p.key}}\`** — ${p.label}: ${p.description}${p.defaultValue ? ` *(default: \`${p.defaultValue}\`)*` : ''}${p.required ? ' ⚠ required' : ''}`,
		),
		``,
		`## Steps`,
		``,
	];

	const steps = skill.steps.map((s, i) => {
		const lines = [
			`### Step ${i + 1}: ${s.description}`,
			``,
			`**Tool:** \`${s.toolId}\`  `,
		];
		if (s.argsTemplate) {
			lines.push(`**Args Template:**`);
			lines.push(`\`\`\`bash`);
			lines.push(`${s.toolId} ${s.argsTemplate}`);
			lines.push(`\`\`\``);
		}
		if (s.optional) { lines.push(`> ⚠ Optional — skipped if tool not installed`); }
		if (s.onDevice) { lines.push(`> 🖥 Runs on SSH device`); }
		lines.push(``);
		return lines.join(`\n`);
	});

	return [...header, ...steps].join(`\n`);
}
