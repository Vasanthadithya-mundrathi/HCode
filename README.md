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
- License: [LICENSE.txt](https://github.com/Vasanthadithya-mundrathi/HCode/blob/main/LICENSE.txt)

## Quick Start

1. Install dependencies:

```bash
npm install
```

1. Start build watchers:

```bash
npm run watch-client-transpiled
npm run watch-clientd
npm run watch-extensionsd
```

1. Launch HCode in dev mode:

```bash
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

## Contributing

See CONTRIBUTING.md for contribution workflow, issue reporting, and pull request expectations.
