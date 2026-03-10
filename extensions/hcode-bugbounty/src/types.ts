/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type TargetType = 'domain' | 'url' | 'ip' | 'cidr' | 'mobile-app' | 'api' | 'other';
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'n/a';
export type FindingStatus = 'new' | 'in-progress' | 'reported' | 'triaged' | 'accepted' | 'resolved' | 'duplicate' | 'n/a';
export type BountyPlatform = 'HackerOne' | 'Bugcrowd' | 'Intigriti' | 'Synack' | 'YesWeHack' | 'OpenBug' | 'Private' | 'Other';

export interface ScopeTarget {
	id: string;
	type: TargetType;
	value: string;           // e.g. "*.example.com", "10.0.0.0/8", "https://api.example.com"
	bountyRange?: string;    // e.g. "$100 - $5000"
	notes?: string;
}

export interface Finding {
	id: string;
	title: string;
	severity: SeverityLevel;
	status: FindingStatus;
	targetId?: string;      // references ScopeTarget.id
	cweId?: string;         // e.g. "CWE-89"
	cvss?: number;
	description: string;
	stepsToReproduce?: string;
	impact?: string;
	reportUrl?: string;
	bountyEarned?: number;
	createdAt: string;      // ISO string
	updatedAt: string;
}

export interface BugBountyProgram {
	id: string;
	name: string;
	platform: BountyPlatform;
	programUrl?: string;
	inScope: ScopeTarget[];
	outOfScope: ScopeTarget[];
	rules: string[];        // important rules of engagement lines
	findings: Finding[];
	createdAt: string;
	active: boolean;
}

export interface HCodeState {
	programs: BugBountyProgram[];
}
