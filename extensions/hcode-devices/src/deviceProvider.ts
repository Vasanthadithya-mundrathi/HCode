/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SSHDevice } from './types';
import { DeviceManager } from './deviceManager';

export type DeviceNodeKind =
	| { kind: 'device'; deviceId: string }
	| { kind: 'empty' };

export class DeviceNode extends vscode.TreeItem {
	constructor(
		public readonly nodeData: DeviceNodeKind,
		label: string,
		state: vscode.TreeItemCollapsibleState,
	) {
		super(label, state);
	}
}

export class DeviceProvider implements vscode.TreeDataProvider<DeviceNode> {
	private readonly _onDidChange = new vscode.EventEmitter<DeviceNode | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChange.event;

	constructor(private readonly _manager: DeviceManager) {
		_manager.onDidChange(() => this._onDidChange.fire());
	}

	refresh(): void { this._onDidChange.fire(); }
	getTreeItem(e: DeviceNode): vscode.TreeItem { return e; }

	getChildren(element?: DeviceNode): DeviceNode[] {
		if (element) { return []; }
		const devices = this._manager.devices;
		if (devices.length === 0) {
			const n = new DeviceNode({ kind: 'empty' }, 'No devices. Click + to add.', vscode.TreeItemCollapsibleState.None);
			n.iconPath = new vscode.ThemeIcon('dash');
			return [n];
		}
		return devices.map(d => this._deviceNode(d));
	}

	private _deviceNode(device: SSHDevice): DeviceNode {
		const connected = this._manager.isConnected(device.id);
		const node = new DeviceNode(
			{ kind: 'device', deviceId: device.id },
			device.label,
			vscode.TreeItemCollapsibleState.None,
		);
		node.description = `${device.user}@${device.host}:${device.port}` + (device.tags.length ? ` [${device.tags.join(', ')}]` : '');
		node.tooltip = new vscode.MarkdownString(
			`**${device.label}**\n\n` +
			`Host: \`${device.host}\` Port: \`${device.port}\`\n\n` +
			`User: \`${device.user}\`\n` +
			(device.keyPath ? `Key: \`${device.keyPath}\`\n` : '') +
			(device.notes ? `\nNotes: ${device.notes}` : '') +
			`\n\nStatus: ${connected ? '🟢 Connected' : '⚫ Disconnected'}`,
		);
		node.iconPath = new vscode.ThemeIcon(
			'remote-explorer',
			new vscode.ThemeColor(connected ? 'debugConsole.infoForeground' : 'disabledForeground'),
		);
		node.contextValue = connected ? 'hcode.device.connected' : 'hcode.device.disconnected';
		return node;
	}
}
