/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DeviceManager } from './deviceManager';
import { DeviceNode, DeviceProvider } from './deviceProvider';
import { SSHDevice } from './types';

/** Public API consumed by hcode-mcp-server and any AI agent extension */
export interface HCodeDevicesAPI {
	manager: DeviceManager;
	getDevices: () => SSHDevice[];
	createDevice: (device: SSHDevice) => Promise<SSHDevice>;
	deleteDevice: (deviceId: string) => Promise<boolean>;
	bootstrapAgentEnvironment: (deviceId: string, profileId?: BootstrapProfileId) => Promise<vscode.Terminal | undefined>;
	/** Connect to a device by id and return the SSH terminal */
	connect: (deviceId: string) => vscode.Terminal;
	/** Run a shell command on a device by id */
	runCommand: (deviceId: string, command: string) => vscode.Terminal;
}

type DeviceCommandTarget = DeviceNode | string | undefined;
type BootstrapProfileId = 'linux-apt' | 'macos-brew' | 'windows-powershell';

interface BootstrapProfile {
	id: BootstrapProfileId;
	label: string;
	description: string;
	detail: string;
	summary: string;
	script: string;
}

export function activate(context: vscode.ExtensionContext): HCodeDevicesAPI {
	const manager = new DeviceManager(context);
	const provider = new DeviceProvider(manager);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('hcode.devices.list', provider),
	);

	// ── Add / remove / edit ───────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.devices.add', async () => {
			const device = await manager.addDevice();
			if (device) { vscode.window.showInformationMessage(`HCode: Device "${device.label}" added.`); }
		}),
		vscode.commands.registerCommand('hcode.devices.remove', async (node: DeviceNode) => {
			const id = node?.nodeData.kind === 'device' ? node.nodeData.deviceId : undefined;
			if (!id) { return; }
			await manager.removeDevice(id);
		}),
		vscode.commands.registerCommand('hcode.devices.edit', async (node: DeviceNode) => {
			const id = node?.nodeData.kind === 'device' ? node.nodeData.deviceId : undefined;
			if (!id) { return; }
			await manager.editDevice(id);
		}),
	);

	// ── Connect / Disconnect ──────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.devices.connect', (node: DeviceNode) => {
			const id = typeof node === 'string' ? node : node?.nodeData.kind === 'device' ? node.nodeData.deviceId : undefined;
			if (!id) { return; }
			manager.connect(id);
		}),
		vscode.commands.registerCommand('hcode.devices.disconnect', (node: DeviceNode) => {
			const id = typeof node === 'string' ? node : node?.nodeData.kind === 'device' ? node.nodeData.deviceId : undefined;
			if (!id) { return; }
			manager.disconnect(id);
		}),
	);

	// ── Copy SSH command ──────────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.devices.copySSHCommand', async (node: DeviceNode) => {
			const id = typeof node === 'string' ? node : node?.nodeData.kind === 'device' ? node.nodeData.deviceId : undefined;
			if (!id) { return; }
			const cmd = manager.sshCommand(id);
			await vscode.env.clipboard.writeText(cmd);
			vscode.window.showInformationMessage(`Copied: ${cmd}`);
		}),
	);

	// ── Run command on device ─────────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.devices.runCommand', async (node: DeviceCommandTarget) => {
			const id = await resolveDeviceId(node, manager);
			if (!id) { return; }
			const cmd = await vscode.window.showInputBox({
				prompt: `Command to run on ${manager.getDevice(id)?.label ?? id}`,
				placeHolder: 'e.g. uname -a && whoami && id',
			});
			if (!cmd?.trim()) { return; }
			manager.runCommand(id, cmd.trim());
		}),
	);

	// ── Run local script on device ────────────────────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.devices.runScript', async (node: DeviceCommandTarget) => {
			const id = await resolveDeviceId(node, manager);
			if (!id) { return; }

			// Let user pick a file, or pick the active editor's file
			let scriptPath: string | undefined;
			const active = vscode.window.activeTextEditor;
			if (active) {
				const useActive = await vscode.window.showQuickPick(
					[
						{ label: `Use current file: ${active.document.fileName.split('/').pop()}`, value: 'current' },
						{ label: 'Browse for file...', value: 'browse' },
					],
					{ placeHolder: 'Which script?' },
				);
				if (!useActive) { return; }
				if (useActive.value === 'current') {
					scriptPath = active.document.uri.fsPath;
				}
			}
			if (!scriptPath) {
				const uris = await vscode.window.showOpenDialog({
					canSelectMany: false,
					filters: { 'Shell Scripts': ['sh', 'bash', 'zsh', 'py', 'rb', 'pl', 'ps1'], 'All Files': ['*'] },
					openLabel: 'Select script',
				});
				scriptPath = uris?.[0]?.fsPath;
			}
			if (!scriptPath) { return; }
			await manager.runScriptOnDevice(id, scriptPath);
		}),
	);

	// ── Configure AI agent environment on device ──────────────────────────────

	context.subscriptions.push(
		vscode.commands.registerCommand('hcode.devices.setupAgentEnv', async (node: DeviceCommandTarget) => {
			const id = await resolveDeviceId(node, manager);
			if (!id) { return; }
			await bootstrapAgentEnvironment(manager, id);
		}),
	);

	// Return public API for consumption by MCP server and AI agent extensions
	return {
		manager,
		getDevices: () => manager.getDevices(),
		createDevice: device => manager.createDevice(device),
		deleteDevice: deviceId => manager.deleteDevice(deviceId),
		bootstrapAgentEnvironment: (deviceId: string, profileId?: BootstrapProfileId) => bootstrapAgentEnvironment(manager, deviceId, profileId),
		connect: (deviceId: string) => manager.connect(deviceId),
		runCommand: (deviceId: string, command: string) => manager.runCommand(deviceId, command),
	};
}

const bootstrapProfiles: readonly BootstrapProfile[] = [
	{
		id: 'linux-apt',
		label: 'Linux (APT: Debian / Ubuntu / Kali)',
		description: 'Installs the widest HCode offensive toolchain via apt, pip, go, cargo, and gem.',
		detail: 'Best for Kali, Ubuntu, Debian, and cloud VPS targets with sudo or root access.',
		summary: 'APT base packages + Python tooling + ProjectDiscovery suite + Rust and Ruby helpers.',
		script: [
			'export DEBIAN_FRONTEND=noninteractive',
			'command -v apt-get >/dev/null && apt-get update -q && apt-get install -y -q nmap masscan nikto sqlmap gobuster ffuf hydra hashcat john netcat-traditional enum4linux smbmap responder binwalk whois dnsutils whatweb curl wget git python3 python3-pip jq make gcc g++ ruby-full golang-go cargo radare2 || true',
			'python3 -m pip install --upgrade pip || true',
			'pip3 install --quiet arjun commix CORScanner wfuzz dirsearch spiderfoot impacket trufflehog s3scanner awscli || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/httpx/cmd/httpx@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/katana/cmd/katana@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/lc/gau/v2/cmd/gau@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/tomnomnom/waybackurls@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/hahwul/dalfox/v2@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/hakluke/hakrawler@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/ffuf/ffuf/v2@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/OJ/gobuster/v3@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/gitleaks/gitleaks/v8@latest 2>/dev/null || true',
			'command -v cargo >/dev/null && cargo install rustscan feroxbuster 2>/dev/null || true',
			'command -v gem >/dev/null && gem install evil-winrm 2>/dev/null || true',
			'mkdir -p "$HOME/.hcode" && [ ! -d "$HOME/.hcode/seclists" ] && git clone --depth 1 https://github.com/danielmiessler/SecLists.git "$HOME/.hcode/seclists" 2>/dev/null || true',
			'command -v nuclei >/dev/null && nuclei -update-templates 2>/dev/null || true',
			'echo "HCode Linux toolchain bootstrap complete on $(hostname)"',
		].join(' && '),
	},
	{
		id: 'macos-brew',
		label: 'macOS (Homebrew)',
		description: 'Uses Homebrew for the local Unix toolchain, then layers Python, Go, Rust, and Ruby packages.',
		detail: 'Best for macOS attack boxes and laptops where Homebrew is already installed.',
		summary: 'Homebrew packages + Python tooling + ProjectDiscovery suite + Rust and Ruby helpers.',
		script: [
			'command -v brew >/dev/null || { echo "Homebrew is required for macOS bootstrap"; exit 1; }',
			'brew update >/dev/null || true',
			'brew install nmap masscan nikto sqlmap gobuster ffuf hydra hashcat john whois wget jq git python go rust ruby whatweb dirsearch radare2 || true',
			'python3 -m pip install --upgrade pip || true',
			'pip3 install --quiet arjun commix CORScanner wfuzz dirsearch spiderfoot impacket trufflehog s3scanner awscli || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/httpx/cmd/httpx@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/projectdiscovery/katana/cmd/katana@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/lc/gau/v2/cmd/gau@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/tomnomnom/waybackurls@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/hahwul/dalfox/v2@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/hakluke/hakrawler@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/ffuf/ffuf/v2@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/OJ/gobuster/v3@latest 2>/dev/null || true',
			'command -v go >/dev/null && go install github.com/gitleaks/gitleaks/v8@latest 2>/dev/null || true',
			'command -v cargo >/dev/null && cargo install rustscan feroxbuster 2>/dev/null || true',
			'command -v gem >/dev/null && gem install evil-winrm 2>/dev/null || true',
			'mkdir -p "$HOME/.hcode" && [ ! -d "$HOME/.hcode/seclists" ] && git clone --depth 1 https://github.com/danielmiessler/SecLists.git "$HOME/.hcode/seclists" 2>/dev/null || true',
			'command -v nuclei >/dev/null && nuclei -update-templates 2>/dev/null || true',
			'echo "HCode macOS toolchain bootstrap complete on $(hostname)"',
		].join(' && '),
	},
	{
		id: 'windows-powershell',
		label: 'Windows (PowerShell + winget / choco)',
		description: 'Bootstraps a Windows operator box over SSH using PowerShell, winget or Chocolatey, and language package managers.',
		detail: 'Best for Windows systems with OpenSSH enabled and PowerShell available in the remote shell.',
		summary: 'Windows CLI prerequisites + Python tooling + Go-based recon utilities; tool coverage is narrower than Linux.',
		script: buildWindowsBootstrapScript(),
	},
];

function buildWindowsBootstrapScript(): string {
	const commandParts = [
		'$ErrorActionPreference = "Continue"',
		'if (Get-Command winget -ErrorAction SilentlyContinue) { winget install --accept-source-agreements --accept-package-agreements Git.Git Python.Python.3.12 GoLang.Go Rustlang.Rustup Microsoft.PowerShell jq.jq Insecure.Nmap | Out-Null } elseif (Get-Command choco -ErrorAction SilentlyContinue) { choco install -y git python golang rustup.install jq nmap }',
		'if (Get-Command py -ErrorAction SilentlyContinue) { py -m pip install --upgrade pip 2>$null }',
		'if (Get-Command pip -ErrorAction SilentlyContinue) { pip install arjun commix CORScanner wfuzz dirsearch spiderfoot impacket trufflehog s3scanner awscli 2>$null }',
		'if (Get-Command go -ErrorAction SilentlyContinue) { go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest; go install github.com/projectdiscovery/httpx/cmd/httpx@latest; go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest; go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest; go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest; go install github.com/projectdiscovery/katana/cmd/katana@latest; go install github.com/lc/gau/v2/cmd/gau@latest; go install github.com/tomnomnom/waybackurls@latest; go install github.com/hahwul/dalfox/v2@latest; go install github.com/hakluke/hakrawler@latest; go install github.com/ffuf/ffuf/v2@latest; go install github.com/OJ/gobuster/v3@latest; go install github.com/gitleaks/gitleaks/v8@latest }',
		'$hcodeRoot = Join-Path $HOME ".hcode"',
		'New-Item -ItemType Directory -Force -Path $hcodeRoot | Out-Null',
		'$seclistsPath = Join-Path $hcodeRoot "seclists"',
		'if (!(Test-Path $seclistsPath) -and (Get-Command git -ErrorAction SilentlyContinue)) { git clone --depth 1 https://github.com/danielmiessler/SecLists.git $seclistsPath | Out-Null }',
		'if (Get-Command nuclei -ErrorAction SilentlyContinue) { nuclei -update-templates | Out-Null }',
		'Write-Host "HCode Windows toolchain bootstrap complete"',
	];

	return 'powershell -NoProfile -ExecutionPolicy Bypass -Command "' + commandParts.join('; ') + '"';
}

async function pickDevice(manager: DeviceManager): Promise<string | undefined> {
	const devices = manager.devices;
	if (devices.length === 0) { vscode.window.showWarningMessage('HCode: No devices configured. Add one first.'); return undefined; }
	const pick = await vscode.window.showQuickPick(
		devices.map(d => ({ label: d.label, description: `${d.user}@${d.host}:${d.port}`, id: d.id })),
		{ placeHolder: 'Select device' },
	);
	return pick?.id;
}

async function resolveDeviceId(target: DeviceCommandTarget, manager: DeviceManager): Promise<string | undefined> {
	if (typeof target === 'string') {
		return manager.getDevice(target) ? target : undefined;
	}
	if (target?.nodeData.kind === 'device') {
		return target.nodeData.deviceId;
	}
	return pickDevice(manager);
}

async function bootstrapAgentEnvironment(manager: DeviceManager, deviceId: string, profileId?: BootstrapProfileId): Promise<vscode.Terminal | undefined> {
	const device = manager.getDevice(deviceId);
	if (!device) {
		vscode.window.showWarningMessage(`HCode: Device '${deviceId}' not found.`);
		return undefined;
	}

	let profile = profileId ? bootstrapProfiles.find(candidate => candidate.id === profileId) : undefined;
	if (!profile) {
		const pick = await vscode.window.showQuickPick(
			bootstrapProfiles.map(candidate => ({
				label: candidate.label,
				description: candidate.description,
				detail: candidate.detail,
				profileId: candidate.id,
			})),
			{ placeHolder: `Select bootstrap profile for ${device.label}` },
		);
		profile = pick ? bootstrapProfiles.find(candidate => candidate.id === pick.profileId) : undefined;
	}
	if (!profile) {
		return undefined;
	}

	const confirm = await vscode.window.showInformationMessage(
		`Bootstrap ${profile.label} toolchain on ${device.label}?\n\n${profile.summary}\n\nThis can take several minutes and may require admin access on the remote host.`,
		{ modal: true },
		'Install',
	);
	if (confirm !== 'Install') {
		return undefined;
	}

	return manager.runCommand(deviceId, profile.script);
}

export function deactivate(): void { /* no-op */ }
