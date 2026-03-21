# HCode Product Baseline

## Product Positioning

HCode is a security-focused IDE built on top of Code - OSS. The current product baseline is designed to ship as a startup-ready platform rather than a collection of disconnected experiments.

The current product shape combines:

- A dedicated HCode application identity with separate app names, data folders, and bundle identifiers.
- A unified HCode sidebar surface for security workflows.
- Built-in extensions for tools, devices, bug bounty operations, skills, CTF helpers, MCP, theming, and ACE control-plane scaffolding.

## Validated State

The current repository has been checked for the following baseline conditions:

- Product metadata is HCode-specific in `product.json`.
- Workspace diagnostics are clean for the touched HCode files.
- VS Code build tasks start successfully.
- Core transpile and typecheck watchers recover and report zero compile errors.
- Extension build output reaches compilation instead of failing on manifest schema errors.
- ACE provider runtime and ACP runtime are wired into the current extension entrypoint.
- The MCP server exports a live runtime API consumed by ACE bridge actions.

## Included HCode Surfaces

### Core Product Identity

- Product name: `HCode`
- Long name: `HCode - Security IDE`
- Application name: `hcode`
- Data folder: `.hcode`
- Bundle identifier: `com.hcode.app`

### Built-In Security Extensions

- `extensions/hcode-tools`
  - Unified HCode sidebar container.
  - Security tool registry and execution surface.
- `extensions/hcode-devices`
  - SSH device inventory.
  - Remote command dispatch.
  - Cross-platform bootstrap profiles.
- `extensions/hcode-bugbounty`
  - Program tracking.
  - Scope management.
  - Finding lifecycle and Markdown export.
- `extensions/hcode-skills`
  - Playbook-driven workflows.
  - Local and device-backed execution.
- `extensions/hcode-ctf`
  - Decoder panel.
  - Hash identification.
  - XOR brute force.
- `extensions/hcode-mcp-server`
  - HTTP MCP endpoint for external agent/tool access.
- `extensions/hcode-ace`
  - ACE dashboard.
  - Provider registry and direct provider execution commands.
  - Personas.
  - Skill pack metadata.
  - Minimal ACP coordinator with bounded worker runs and deterministic validation.
  - Live MCP bridge status and start/stop controls.
- `extensions/theme-hcode`
  - HCode dark product theme.

## Startup Readiness

This baseline is suitable for:

- Internal demos.
- Early customer walkthroughs.
- Partner handoff for continued productization.
- Developer onboarding around a concrete HCode product direction.

It should be treated as a startup baseline, not a finished enterprise release.

## Current Non-Blocking Gaps

The following areas still need product development, but they do not block the current baseline from being handed off:

- ACE provider routing executes real provider HTTP requests, but still depends on real credentials, tenant-specific endpoints, and operator validation against live services.
- ACP is implemented as a bounded runtime for short worker plans, but not yet as a full production scheduler with persistence, retries, background orchestration, or long-lived state.
- Some additional extension manifests exist as early scaffolds without full implementation behind them.
- Runtime UX polish and credentialed end-to-end acceptance testing are still pending.
- Packaged builds now have a multi-OS GitHub release workflow baseline in `.github/workflows/release-hcode.yml`; signing/notarization hardening is still pending.
- MCP is loopback-bound by default and now has a remote deployment hardening guide in `docs/HCODE_MCP_DEPLOYMENT.md`.

## Recommended Handoff Scope

If another team takes over HCode next, the recommended order is:

1. Finish ACE request execution and model routing.
2. Deepen ACP from a bounded coordinator/worker runtime into a production scheduler.
3. Expand ACE and MCP runtime validation with real provider credentials and operator workflows.
4. Add packaged-build validation on macOS, Linux, and Windows.
5. Consolidate partial extension scaffolds into shipped or removed product surfaces.

## Run Notes

HCode uses its own product identity and data folders, so it is already separated from a standard VS Code installation at the product level.

For local development, use the repo tasks instead of ad hoc launch flags where possible:

- `VS Code - Build`
- `Run Dev`
- `Run Dev Sessions`

## Handoff Summary

HCode is no longer just a renamed Code - OSS tree. The repo now contains a coherent startup-product baseline with:

- Distinct product identity.
- Unified security workflow surface.
- Remote-device operations.
- Bug bounty workflow management.
- Skill-based execution.
- MCP exposure for external agents.
- A functional ACE control-plane baseline with provider execution, bounded ACP runs, personas, skill-pack metadata, and live MCP bridge controls.

The next team should treat this as a product foundation with clear runtime gaps, not as an unstructured prototype.
