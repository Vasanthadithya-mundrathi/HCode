/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface HCodeContextEvent {
	id: string;
	type: string;
	source: string;
	title: string;
	details?: string;
	payload?: Record<string, unknown>;
	createdAt: string;
}

const contextEventHistoryKey = 'hcode.context.events';
const maxContextEvents = 100;

export class HCodeContextBus {
	private readonly onDidPublishEmitter = new vscode.EventEmitter<HCodeContextEvent>();
	readonly onDidPublish = this.onDidPublishEmitter.event;

	constructor(private readonly context: vscode.ExtensionContext) { }

	getEvents(): HCodeContextEvent[] {
		return this.context.workspaceState.get<HCodeContextEvent[]>(contextEventHistoryKey, []);
	}

	async publish(event: Omit<HCodeContextEvent, 'id' | 'createdAt'>): Promise<HCodeContextEvent> {
		const fullEvent: HCodeContextEvent = {
			id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			createdAt: new Date().toISOString(),
			...event,
		};

		const existing = this.getEvents();
		existing.unshift(fullEvent);
		await this.context.workspaceState.update(contextEventHistoryKey, existing.slice(0, maxContextEvents));
		this.onDidPublishEmitter.fire(fullEvent);
		return fullEvent;
	}
}
