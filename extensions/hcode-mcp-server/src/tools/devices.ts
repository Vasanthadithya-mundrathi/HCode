/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Vasantha Adithya. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IHCodeDevicesAPI } from '../types.js';

export function registerDeviceTools(server: McpServer, api: IHCodeDevicesAPI): void {
	// ── List devices ──────────────────────────────────────────────────────────
	server.tool(
		'hcode_dev_list_devices',
		'List all registered SSH devices (targets) with their host, user, port and tags.',
		{},
		async () => {
			const devices = api.getDevices();
			const summary = devices.map(d => ({
				id: d.id,
				label: d.label,
				host: d.host,
				port: d.port,
				user: d.user,
				keyPath: d.keyPath,
				tags: d.tags,
				notes: d.notes,
			}));
			return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
		},
	);

	// ── Add device ────────────────────────────────────────────────────────────
	server.tool(
		'hcode_dev_add_device',
		'Register a new SSH device / target machine.',
		{
			label: z.string().describe('Human-readable label for the device, e.g. "Acme prod server"'),
			host: z.string().describe('Hostname or IP address'),
			port: z.number().int().min(1).max(65535).default(22).describe('SSH port (default 22)'),
			user: z.string().describe('SSH username'),
			keyPath: z.string().optional().describe('Path to private key file (leave empty to use password auth)'),
			tags: z.array(z.string()).optional().describe('Tags for grouping, e.g. ["prod", "aws"]'),
			notes: z.string().optional().describe('Optional notes about this device'),
		},
		async (args: { label: string; host: string; port: number; user: string; keyPath?: string; tags?: string[]; notes?: string }) => {
			const device = await api.createDevice({
				id: `${args.user}@${args.host}:${args.port}`,
				label: args.label,
				host: args.host,
				port: args.port,
				user: args.user,
				keyPath: args.keyPath ?? '',
				tags: args.tags ?? [],
				notes: args.notes ?? '',
			});
			return { content: [{ type: 'text' as const, text: JSON.stringify(device, null, 2) }] };
		},
	);

	// ── Remove device ─────────────────────────────────────────────────────────
	server.tool(
		'hcode_dev_remove_device',
		'Remove a registered SSH device.',
		{
			deviceId: z.string().describe('The ID of the device to remove'),
		},
		async (args: { deviceId: string }) => {
			const ok = await api.deleteDevice(args.deviceId);
			return { content: [{ type: 'text' as const, text: ok ? `Device ${args.deviceId} removed` : `Error: device ${args.deviceId} not found` }] };
		},
	);

	// ── Connect ───────────────────────────────────────────────────────────────
	server.tool(
		'hcode_dev_connect',
		'Open an interactive SSH terminal session to a registered device.',
		{
			deviceId: z.string().describe('The ID of the device to connect to'),
		},
		async (args: { deviceId: string }) => {
			try {
				api.connect(args.deviceId);
				return { content: [{ type: 'text' as const, text: `SSH terminal opened for device ${args.deviceId}` }] };
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return { content: [{ type: 'text' as const, text: `Error: ${message}` }] };
			}
		},
	);

	// ── Run command ───────────────────────────────────────────────────────────
	server.tool(
		'hcode_dev_run_command',
		'Run a shell command on a remote SSH device. Opens an integrated terminal executing the command.',
		{
			deviceId: z.string().describe('The ID of the device to run the command on'),
			command: z.string().describe('Shell command to execute, e.g. "uname -a && id"'),
		},
		async (args: { deviceId: string; command: string }) => {
			try {
				api.runCommand(args.deviceId, args.command);
				return { content: [{ type: 'text' as const, text: `Command sent to device ${args.deviceId}: ${args.command}` }] };
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return { content: [{ type: 'text' as const, text: `Error: ${message}` }] };
			}
		},
	);

	// ── Bootstrap agent env ───────────────────────────────────────────────────
	server.tool(
		'hcode_dev_bootstrap_agent_env',
		'Bootstrap the AI agent environment on a remote device using a selected OS profile. This installs the base security toolchain and language runtimes needed by HCode skills and agents.',
		{
			deviceId: z.string().describe('The ID of the device to bootstrap'),
			profile: z.enum(['linux-apt', 'macos-brew', 'windows-powershell']).optional().describe('Target OS bootstrap profile; omit to use the Linux APT profile by default'),
		},
		async (args: { deviceId: string; profile?: 'linux-apt' | 'macos-brew' | 'windows-powershell' }) => {
			try {
				api.bootstrapAgentEnvironment(args.deviceId, args.profile ?? 'linux-apt');
				return { content: [{ type: 'text' as const, text: `Bootstrap toolchain command sent to device ${args.deviceId} using profile ${args.profile ?? 'linux-apt'}. Watch the terminal for progress.` }] };
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return { content: [{ type: 'text' as const, text: `Error: ${message}` }] };
			}
		},
	);
}
