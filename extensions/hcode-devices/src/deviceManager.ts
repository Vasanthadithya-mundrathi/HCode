/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DeviceState, SSHDevice } from './types';
import { randomUUID } from 'crypto';

const STATE_KEY = 'hcode.devices.state';

export class DeviceManager {
	private _state: DeviceState;
	private readonly _onChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onChange.event;

	/** Tracks which device terminals are currently open (deviceId → terminal) */
	private readonly _activeTerminals = new Map<string, vscode.Terminal>();

	constructor(private readonly _ctx: vscode.ExtensionContext) {
		this._state = _ctx.globalState.get<DeviceState>(STATE_KEY) ?? { devices: [] };

		// Clean up our tracking when any terminal closes
		_ctx.subscriptions.push(
			vscode.window.onDidCloseTerminal((t: vscode.Terminal) => {
				for (const [id, term] of this._activeTerminals) {
					if (term === t) { this._activeTerminals.delete(id); this._onChange.fire(); }
				}
			}),
		);
	}

	get devices(): SSHDevice[] { return this._state.devices; }

	getDevices(): SSHDevice[] { return this._state.devices; }

	async createDevice(device: SSHDevice): Promise<SSHDevice> {
		this._state.devices.push(device);
		await this._save();
		return device;
	}

	async deleteDevice(id: string): Promise<boolean> {
		const existing = this.getDevice(id);
		if (!existing) { return false; }
		if (this._activeTerminals.has(id)) {
			this._activeTerminals.get(id)?.dispose();
			this._activeTerminals.delete(id);
		}
		this._state.devices = this._state.devices.filter(d => d.id !== id);
		await this._save();
		return true;
	}

	getDevice(id: string): SSHDevice | undefined {
		return this._state.devices.find(d => d.id === id);
	}

	isConnected(id: string): boolean {
		return this._activeTerminals.has(id);
	}

	// ── CRUD ──────────────────────────────────────────────────────────────────

	async addDevice(): Promise<SSHDevice | undefined> {
		const label = await vscode.window.showInputBox({ prompt: 'Device label (e.g. "Kali VPS")', validateInput: (v: string) => v.trim() ? undefined : 'Required' });
		if (!label) { return undefined; }

		const host = await vscode.window.showInputBox({ prompt: 'Host / IP address', validateInput: (v: string) => v.trim() ? undefined : 'Required' });
		if (!host) { return undefined; }

		const portStr = await vscode.window.showInputBox({ prompt: 'SSH port', value: '22', validateInput: (v: string) => isNaN(Number(v)) ? 'Must be a number' : undefined });
		if (portStr === undefined) { return undefined; }

		const user = await vscode.window.showInputBox({ prompt: 'Username', value: 'root', validateInput: (v: string) => v.trim() ? undefined : 'Required' });
		if (!user) { return undefined; }

		const authType = await vscode.window.showQuickPick(['SSH key (recommended)', 'Password (less secure)'], { placeHolder: 'Authentication method' });
		if (!authType) { return undefined; }

		let keyPath = '';
		if (authType.startsWith('SSH key')) {
			const picked = await vscode.window.showInputBox({
				prompt: 'Path to private key file',
				placeHolder: '~/.ssh/id_rsa',
				value: '~/.ssh/id_rsa',
			});
			keyPath = picked?.trim() ?? '';
		}

		const tagsStr = await vscode.window.showInputBox({ prompt: 'Tags (comma-separated, optional)', placeHolder: 'lab, kali, vps' });
		const notes = await vscode.window.showInputBox({ prompt: 'Notes (optional)' }) ?? '';

		const device: SSHDevice = {
			id: randomUUID(),
			label: label.trim(),
			host: host.trim(),
			port: Number(portStr) || 22,
			user: user.trim(),
			keyPath,
			tags: tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [],
			notes: notes.trim(),
		};
		return this.createDevice(device);
	}

	async editDevice(id: string): Promise<void> {
		const device = this.getDevice(id);
		if (!device) { return; }

		const field = await vscode.window.showQuickPick(
			['label', 'host', 'port', 'user', 'keyPath', 'tags', 'notes'],
			{ placeHolder: `Edit field for "${device.label}"` },
		);
		if (!field) { return; }

		const currentValues: Record<typeof field, string> = {
			label: device.label,
			host: device.host,
			port: String(device.port),
			user: device.user,
			keyPath: device.keyPath,
			tags: device.tags.join(', '),
			notes: device.notes,
		};
		const current = currentValues[field];
		const newVal = await vscode.window.showInputBox({ prompt: `New value for ${field}`, value: current });
		if (newVal === undefined) { return; }

		if (field === 'port') {
			device.port = Number(newVal) || device.port;
		} else if (field === 'tags') {
			device.tags = newVal.split(',').map(t => t.trim()).filter(Boolean);
		} else if (field === 'label' || field === 'host' || field === 'user' || field === 'keyPath' || field === 'notes') {
			device[field] = newVal.trim();
		} else {
			return;
		}
		await this._save();
	}

	async removeDevice(id: string): Promise<void> {
		const device = this.getDevice(id);
		if (!device) { return; }
		const confirm = await vscode.window.showWarningMessage(`Remove device "${device.label}"?`, { modal: true }, 'Remove');
		if (confirm !== 'Remove') { return; }
		if (this._activeTerminals.has(id)) {
			this._activeTerminals.get(id)?.dispose();
			this._activeTerminals.delete(id);
		}
		await this.deleteDevice(id);
	}

	// ── SSH terminal ──────────────────────────────────────────────────────────

	connect(id: string): vscode.Terminal {
		// Reuse existing terminal if still open
		const existing = this._activeTerminals.get(id);
		if (existing) {
			existing.show(true);
			return existing;
		}

		const device = this.getDevice(id);
		if (!device) { throw new Error(`Device ${id} not found`); }

		const sshArgs = this._buildSSHArgs(device);
		const terminal = vscode.window.createTerminal({
			name: `SSH: ${device.label}`,
			shellPath: '/usr/bin/ssh',
			shellArgs: sshArgs,
			iconPath: new vscode.ThemeIcon('remote-explorer'),
		});
		terminal.show(true);
		this._activeTerminals.set(id, terminal);
		this._onChange.fire();
		return terminal;
	}

	disconnect(id: string): void {
		const t = this._activeTerminals.get(id);
		if (t) { t.dispose(); this._activeTerminals.delete(id); this._onChange.fire(); }
	}

	/**
	 * Run a shell command on the device. Opens/reuses the device terminal and
	 * sends the command as input — mirrors what a user would type.
	 */
	runCommand(id: string, command: string): vscode.Terminal {
		const terminal = this.connect(id);
		terminal.sendText(command);
		return terminal;
	}

	/**
	 * Copy a local script to the device via scp and then execute it, all in a
	 * dedicated terminal so output is visible.
	 */
	async runScriptOnDevice(id: string, localScriptPath: string): Promise<void> {
		const device = this.getDevice(id);
		if (!device) { return; }

		const remotePath = `/tmp/${localScriptPath.split('/').pop() ?? 'hcode_script.sh'}`;
		const scpArgs = this._buildSCPArgs(device, localScriptPath, remotePath);

		const terminal = vscode.window.createTerminal({
			name: `Run script on ${device.label}`,
			iconPath: new vscode.ThemeIcon('play'),
		});
		terminal.show(true);
		terminal.sendText(`scp ${scpArgs.join(' ')} && ssh ${this._buildSSHArgs(device).join(' ')} "chmod +x ${remotePath} && ${remotePath}"`);
		this._onChange.fire();
	}

	/** Returns a copy-ready SSH one-liner for the device */
	sshCommand(id: string): string {
		const device = this.getDevice(id);
		if (!device) { return ''; }
		return `ssh ${this._buildSSHArgs(device).join(' ')}`;
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	private _buildSSHArgs(device: SSHDevice): string[] {
		const args: string[] = [];
		if (device.port !== 22) { args.push('-p', String(device.port)); }
		if (device.keyPath) { args.push('-i', device.keyPath); }
		args.push('-o', 'StrictHostKeyChecking=accept-new');
		args.push(`${device.user}@${device.host}`);
		return args;
	}

	private _buildSCPArgs(device: SSHDevice, local: string, remote: string): string[] {
		const args: string[] = [];
		if (device.port !== 22) { args.push('-P', String(device.port)); }
		if (device.keyPath) { args.push('-i', device.keyPath); }
		args.push(local, `${device.user}@${device.host}:${remote}`);
		return args;
	}

	private async _save(): Promise<void> {
		await this._ctx.globalState.update(STATE_KEY, this._state);
		this._onChange.fire();
	}
}
