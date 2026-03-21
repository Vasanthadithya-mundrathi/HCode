/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IHCodeToolsAPI } from '../types.js';

export function registerSecurityToolTools(server: McpServer, api: IHCodeToolsAPI): void {
	// List tools
	server.tool(
		'hcode_tools_list',
		'List all available security tools with their categories, presets, installation hints, and whether the binary is installed on this machine.',
		{
			category: z.string().optional().describe('Filter by category: recon, web, fuzzing, password, network, osint, or leave empty for all'),
			onlyInstalled: z.boolean().optional().describe('Set to true to show only tools that are installed'),
		},
		async (args: { category?: string; onlyInstalled?: boolean }) => {
			const availability = await api.refreshAvailability();
			let tools = api.tools;

			if (args.category) {
				tools = tools.filter(t => t.category.toLowerCase() === args.category!.toLowerCase());
			}
			if (args.onlyInstalled) {
				tools = tools.filter(t => availability.get(t.id) === true);
			}

			const result = tools.map(t => ({
				id: t.id,
				name: t.name,
				binary: t.binary,
				category: t.category,
				description: t.description,
				source: t.source,
				installed: availability.get(t.id) ?? false,
				presets: t.presets.map(p => ({ label: p.label, args: p.args })),
				installHint: t.installHint,
			}));

			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		},
	);

	// Check availability
	server.tool(
		'hcode_tools_check_availability',
		'Check which security tool binaries are installed on the local machine.',
		{},
		async () => {
			const availability = await api.refreshAvailability();
			const result: Record<string, boolean> = {};
			for (const [id, installed] of availability.entries()) {
				result[id] = installed;
			}
			const installed = Object.entries(result).filter(([, v]) => v).map(([k]) => k);
			const missing = Object.entries(result).filter(([, v]) => !v).map(([k]) => k);
			return {
				content: [{
					type: 'text' as const,
					text: JSON.stringify({ installed, missing, total: Object.keys(result).length }, null, 2),
				}],
			};
		},
	);

	// Run tool
	server.tool(
		'hcode_tools_run',
		'Run a security tool in a VS Code terminal. Provide the tool ID and the raw command-line arguments. Use hcode_tools_list to get preset argument templates for each tool where {target} can be replaced.',
		{
			toolId: z.string().describe('Tool ID (e.g. "nmap", "sqlmap", "ffuf", "subfinder")'),
			args: z.string().describe('Raw arguments string, e.g. "-sV -sC -p 80,443 192.168.1.1" for nmap. Replace any {target} placeholders with the actual target.'),
		},
		async (args: { toolId: string; args: string }) => {
			try {
				api.runToolHeadless(args.toolId, args.args);
				return { content: [{ type: 'text' as const, text: `Tool "${args.toolId}" started with args: ${args.args}\nCheck the VS Code terminal panel for output.` }] };
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return { content: [{ type: 'text' as const, text: `Error running ${args.toolId}: ${message}` }] };
			}
		},
	);

	// Install tool locally
	server.tool(
		'hcode_tools_install',
		'Install a local security tool with one-click workflow in VS Code. This launches an install terminal and verifies that the binary is available afterward.',
		{
			toolId: z.string().describe('Tool ID (e.g. "nmap", "sqlmap", "ffuf", "subfinder")'),
		},
		async (args: { toolId: string }) => {
			try {
				await api.installToolHeadless(args.toolId);
				return { content: [{ type: 'text' as const, text: `Started one-click install for "${args.toolId}". Check the VS Code terminal panel for progress.` }] };
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return { content: [{ type: 'text' as const, text: `Error installing ${args.toolId}: ${message}` }] };
			}
		},
	);

	// Run tool on device
	server.tool(
		'hcode_tools_run_on_device',
		'Run a security tool on a remote SSH device. Useful for running tools from a VPS or pivot host. Uses hcode-devices to open an SSH terminal and sends the tool command.',
		{
			deviceId: z.string().describe('Device ID to run the tool on (from hcode_dev_list_devices)'),
			toolId: z.string().describe('Tool ID (e.g. "nmap", "sqlmap", "ffuf")'),
			args: z.string().describe('Raw argument string for the tool'),
		},
		async (args: { deviceId: string; toolId: string; args: string }) => {
			try {
				const vscode = await import('vscode');
				const devExt = vscode.extensions.getExtension('hcode.hcode-devices');
				if (!devExt) {
					return { content: [{ type: 'text' as const, text: 'Error: hcode-devices extension not available' }] };
				}
				const devAPI = devExt.exports as IHCodeToolsAPI & { runCommand: (deviceId: string, cmd: string) => unknown };
				const tool = api.tools.find(t => t.id === args.toolId);
				if (!tool) {
					return { content: [{ type: 'text' as const, text: `Error: tool "${args.toolId}" not found` }] };
				}
				const command = `${tool.binary} ${args.args}`;
				(devAPI as unknown as { runCommand: (id: string, cmd: string) => void }).runCommand(args.deviceId, command);
				return { content: [{ type: 'text' as const, text: `Sent to device ${args.deviceId}: ${command}` }] };
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return { content: [{ type: 'text' as const, text: `Error: ${message}` }] };
			}
		},
	);
}
