# HCode Agent Instructions

## Product Identity

HCode is a security-focused fork/product built on top of Code - OSS and is owned by Vasanthadithya-mundrathi.

Treat this repository as HCode-first for:

- Product naming and branding.
- Documentation and issue links.
- Release workflows and packaging.
- Extension behavior for offensive/defensive security workflows.

When touching upstream subsystems, preserve existing architecture and conventions. When touching HCode-owned surfaces (for example under `extensions/hcode-*`, `docs/`, and HCode workflows), prefer HCode naming and behavior.

## HCode Surfaces

The primary HCode extensions and capabilities are:

- `extensions/hcode-tools`: security tool registry and execution.
- `extensions/hcode-devices`: SSH device inventory and remote dispatch.
- `extensions/hcode-bugbounty`: program, scope, and finding lifecycle.
- `extensions/hcode-skills`: reusable playbooks and guided runs.
- `extensions/hcode-ctf`: CTF helpers (decode/hash/xor panel).
- `extensions/hcode-mcp-server`: MCP HTTP bridge for external agents.
- `extensions/hcode-ace`: ACE dashboard, provider router, ACP orchestration.
- `extensions/theme-hcode`: HCode visual identity defaults.

## ACE / ACP / MCP Notes

- ACE is the control plane for provider routing and operations UX.
- ACP is bounded orchestration with explicit terminal states.
- MCP is local-first and can be exposed remotely only with hardening.

For remote MCP guidance, see `docs/HCODE_MCP_DEPLOYMENT.md`.

## Validation Rules

For TypeScript changes:

- Always check `VS Code - Build` task output before declaring completion.
- Do not run tests while there are active compile/type errors.
- Prefer existing workspace tasks and scripts over ad hoc command chains.

For docs/workflow changes:

- Validate file diagnostics.
- Ensure links/paths are HCode-specific and not Microsoft VS Code defaults.

## Coding Conventions

### Indentation

- Use tabs, not spaces.

### Naming

- PascalCase for types and enum values.
- camelCase for functions, methods, properties, and locals.
- Prefer whole words in symbol names.

### Types

- Avoid `any`/`unknown` unless unavoidable.
- Do not export types/functions unless they are shared across components.

### Strings and UI

- Use single quotes for non-user-facing strings.
- Use localized strings for user-facing text where required by subsystem.
- Use title-style capitalization for commands and menu labels.

### Style

- Prefer `async`/`await` over raw promise chains.
- Use arrow functions where appropriate.
- Keep loop/conditional bodies in braces.
- Prefer `export function` over top-level `export const fn =` where practical.

### Quality and Ownership

- Keep existing headers unchanged unless a migration explicitly requires updates.
- Do not add Microsoft-only ownership headers to new HCode-owned files.
- Reuse existing utilities/patterns before creating new abstractions.
- Register disposables immediately and avoid leak-prone listener patterns.

## File Discovery Hints

- Start with semantic/file search for broad concepts.
- Use fast grep for exact command IDs, settings keys, and error strings.
- Follow imports and command registrations to verify runtime wiring.
- Check related tests before changing behavior.
