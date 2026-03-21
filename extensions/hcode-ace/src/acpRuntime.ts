/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AceProviderRuntime } from './providerRuntime';
import { AceAcpRunResult, AceAcpTaskPlan, AceAcpWorkerResult, AcePersona } from './types';

interface PlannedWorkerPayload {
	tasks: AceAcpTaskPlan[];
}

interface WorkerPayload {
	summary: string;
	evidence: string[];
	confidence: 'low' | 'medium' | 'high';
}

export class AceAcpRuntime {
	constructor(
		private readonly providerRuntime: AceProviderRuntime,
		private readonly maxWorkers: number,
	) { }

	async runObjective(objective: string, persona: AcePersona, providerId?: string): Promise<AceAcpRunResult> {
		const plan = await this.buildPlan(objective, persona, providerId);
		const workers: AceAcpWorkerResult[] = [];

		for (const task of plan) {
			const worker = await this.runWorker(task, objective, persona, providerId);
			workers.push(worker);
		}

		const passedWorkers = workers.filter(worker => worker.validation === 'passed');
		const summary = passedWorkers.length
			? passedWorkers.map(worker => `- ${worker.title}: ${worker.output}`).join('\n')
			: 'No worker output passed deterministic validation.';

		return {
			objective,
			providerId: providerId ?? 'active-provider',
			personaId: persona.id,
			plan,
			workers,
			summary,
		};
	}

	private async buildPlan(objective: string, persona: AcePersona, providerId?: string): Promise<AceAcpTaskPlan[]> {
		const result = await this.providerRuntime.invoke({
			providerId,
			systemPrompt: `${persona.systemPrompt}\nReturn only strict JSON.`,
			prompt: [
				'Create a bounded ACE plan with at most three short-lived worker tasks.',
				`Objective: ${objective}`,
				'Return JSON in the shape {"tasks":[{"title":"...","objective":"...","validationHint":"..."}]}.',
				'Do not include markdown fences or commentary.',
			].join('\n'),
			maxTokens: 800,
		});

		const payload = this.parseJson<PlannedWorkerPayload>(result.text);
		const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
		const normalized = tasks
			.filter(task => task && task.title && task.objective && task.validationHint)
			.slice(0, this.maxWorkers)
			.map(task => ({
				title: task.title.trim(),
				objective: task.objective.trim(),
				validationHint: task.validationHint.trim(),
			}));

		if (normalized.length) {
			return normalized;
		}

		return [{
			title: 'Primary objective',
			objective,
			validationHint: 'Provide concrete evidence and a confidence rating.',
		}];
	}

	private async runWorker(task: AceAcpTaskPlan, rootObjective: string, persona: AcePersona, providerId?: string): Promise<AceAcpWorkerResult> {
		const result = await this.providerRuntime.invoke({
			providerId,
			systemPrompt: `${persona.systemPrompt}\nReturn only strict JSON.`,
			prompt: [
				`Root objective: ${rootObjective}`,
				`Worker title: ${task.title}`,
				`Worker objective: ${task.objective}`,
				`Validation requirement: ${task.validationHint}`,
				'Return JSON in the shape {"summary":"...","evidence":["..."],"confidence":"low|medium|high"}.',
				'Do not include markdown fences or commentary.',
			].join('\n'),
			maxTokens: 1000,
		});

		const payload = this.parseJson<WorkerPayload>(result.text);
		const evidence = Array.isArray(payload?.evidence)
			? payload.evidence.map(item => String(item).trim()).filter(Boolean)
			: [];

		const output = typeof payload?.summary === 'string' ? payload.summary.trim() : '';
		const confidence = payload?.confidence === 'high' || payload?.confidence === 'medium' || payload?.confidence === 'low'
			? payload.confidence
			: 'low';

		const validation = output && evidence.length ? 'passed' : 'failed';

		return {
			title: task.title,
			objective: task.objective,
			validationHint: task.validationHint,
			output,
			evidence,
			confidence,
			validation,
		};
	}

	private parseJson<T>(input: string): T | undefined {
		const trimmed = input.trim();
		const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
		const candidate = fenced?.[1]?.trim() || trimmed;
		try {
			return JSON.parse(candidate) as T;
		} catch {
			return undefined;
		}
	}
} 
