/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Expose HCode capability discovery so external MCP clients can quickly detect
 * which command surfaces are available in the current VS Code session.
 */
export function registerCapabilityTools(mcp: McpServer): void {
	mcp.tool(
		'hcode_capabilities_list',
		'Return the HCode capability model by delegating to the hcode.capabilities.list VS Code command.',
		{},
		async () => {
			try {
				const model = await vscode.commands.executeCommand('hcode.capabilities.list');
				return {
					content: [{ type: 'text', text: JSON.stringify(model, null, 2) }],
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: 'text', text: `Failed to resolve capabilities: ${message}` }],
				};
			}
		},
	);
}
