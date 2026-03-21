# HCode

HCode is a security-focused IDE built on top of Code - OSS. It packages offensive and defensive workflow tooling into one workspace: tools orchestration, remote device operations, bug bounty workflow tracking, skills/playbooks, CTF utilities, MCP integration, and ACE control-plane orchestration.

## Highlights

- Unified HCode sidebar for security workflows.
- Local and remote tool execution via HCode Tools and HCode Devices.
- Bug bounty program and finding lifecycle management.
- Skill packs and repeatable playbooks.
- CTF helper panel for common encoding/decoding and analysis loops.
- MCP server bridge for external agent integrations.
- ACE dashboard for provider routing, personas, and orchestration controls.

## Repository

- Main repository: [HCode Repository](https://github.com/Vasanthadithya-mundrathi/HCode)
- Issues: [HCode Issues](https://github.com/Vasanthadithya-mundrathi/HCode/issues)
- License: [LICENSE.txt](https://raw.githubusercontent.com/Vasanthadithya-mundrathi/HCode/main/LICENSE.txt)

## Quick Start

- Step 1: Install dependencies.

```bash
npm install
```

- Step 2: In VS Code, run the workspace build task.

- `VS Code - Build`

- Step 3: Launch HCode sessions mode from tasks.

- `Run Dev Sessions`

## Alternate Terminal Flow

If you prefer terminal commands over workspace tasks:

```bash
npm run watch-client-transpiled
npm run watch-clientd
npm run watch-extensionsd
./scripts/code.sh --sessions
```

## Built-In HCode Extensions

- extensions/hcode-tools
- extensions/hcode-devices
- extensions/hcode-bugbounty
- extensions/hcode-skills
- extensions/hcode-ctf
- extensions/hcode-mcp-server
- extensions/hcode-ace
- extensions/theme-hcode

## Current Baseline Notes

The current product baseline and handoff notes live in HCODE_PRODUCT.md.

## Deployment and Release

- MCP remote hardening guide: docs/HCODE_MCP_DEPLOYMENT.md
- Multi-OS release workflow: .github/workflows/release-hcode.yml

## Contributing

See CONTRIBUTING.md for contribution workflow, issue reporting, and pull request expectations.
