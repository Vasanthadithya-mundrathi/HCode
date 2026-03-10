/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface SSHDevice {
	id: string;
	label: string;
	host: string;
	port: number;
	user: string;
	/** Absolute path to private key, OR empty string if using password auth */
	keyPath: string;
	/** Tag / group e.g. "lab", "vps", "ctf-box" */
	tags: string[];
	/** Arbitrary notes */
	notes: string;
}

export interface DeviceState {
	devices: SSHDevice[];
}
