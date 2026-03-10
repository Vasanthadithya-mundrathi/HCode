/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Vasantha Adithya. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerCTFTools(server: McpServer): void {
	// ── Decode / encode ───────────────────────────────────────────────────────
	server.tool(
		'hcode_ctf_decode',
		'Decode or encode text using common CTF encodings: base64, hex, url, rot13, binary, morse, atbash, caesar.',
		{
			text: z.string().describe('The text to decode or encode'),
			encoding: z.enum(['base64', 'base64url', 'hex', 'url', 'rot13', 'binary', 'atbash', 'caesar']).describe('Encoding/decoding method'),
			direction: z.enum(['decode', 'encode']).default('decode').describe('Whether to decode or encode'),
			caesarShift: z.number().int().min(1).max(25).default(13).describe('Caesar shift amount (only used when encoding=caesar)'),
		},
		async (args: { text: string; encoding: 'base64' | 'base64url' | 'hex' | 'url' | 'rot13' | 'binary' | 'atbash' | 'caesar'; direction: 'decode' | 'encode'; caesarShift: number }) => {
			let result: string;
			try {
				result = transformText(args.text, args.encoding, args.direction, args.caesarShift);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				result = `Error: ${message}`;
			}
			return { content: [{ type: 'text' as const, text: result }] };
		},
	);

	// ── Identify hash ─────────────────────────────────────────────────────────
	server.tool(
		'hcode_ctf_identify_hash',
		'Identify the likely hash algorithm from a hash string based on its length and character set.',
		{
			hash: z.string().describe('The hash string to identify'),
		},
		async (args: { hash: string }) => {
			const result = identifyHash(args.hash.trim());
			return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
		},
	);

	// ── XOR brute force ───────────────────────────────────────────────────────
	server.tool(
		'hcode_ctf_xor_brute',
		'Brute-force XOR single-byte keys on a hex-encoded ciphertext and return the top candidates (printable ASCII, sorted by frequency score). Useful for XOR-encrypted CTF challenges.',
		{
			ciphertextHex: z.string().describe('Hex-encoded ciphertext to XOR brute-force, e.g. "1a2b3c4d"'),
			topN: z.number().int().min(1).max(26).default(5).describe('Number of top candidates to return'),
		},
		async (args: { ciphertextHex: string; topN: number }) => {
			const results = xorBrute(args.ciphertextHex, args.topN);
			return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
		},
	);

	// ── Extract flags ─────────────────────────────────────────────────────────
	server.tool(
		'hcode_ctf_extract_flags',
		'Extract all CTF flags from a block of text using common flag patterns (CTF{}, FLAG{}, HTB{}, THM{}, DUCTF{}, picoCTF{}, etc.).',
		{
			text: z.string().describe('Text to search for flags'),
		},
		async (args: { text: string }) => {
			const flags = extractFlags(args.text);
			return { content: [{ type: 'text' as const, text: JSON.stringify({ count: flags.length, flags }, null, 2) }] };
		},
	);

	// ── Multi-decode attempt ──────────────────────────────────────────────────
	server.tool(
		'hcode_ctf_auto_decode',
		'Try to auto-decode a string using all common CTF encodings and return all results that contain printable text. Useful when you have an unknown encoding.',
		{
			text: z.string().describe('String to attempt to decode with all methods'),
		},
		async (args: { text: string }) => {
			const attempts = autoDecode(args.text);
			return { content: [{ type: 'text' as const, text: JSON.stringify(attempts, null, 2) }] };
		},
	);
}

// ─── Pure transform helpers (no VS Code dependency) ──────────────────────────

function transformText(text: string, encoding: string, direction: string, caesarShift: number): string {
	if (direction === 'decode') {
		switch (encoding) {
			case 'base64':
			case 'base64url': return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
			case 'hex': return Buffer.from(text.replace(/\s/g, ''), 'hex').toString('utf8');
			case 'url': return decodeURIComponent(text);
			case 'rot13': return text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13)));
			case 'binary': return text.split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join('');
			case 'atbash': return text.replace(/[a-zA-Z]/g, c => {
				const base = c < 'a' ? 65 : 97;
				return String.fromCharCode(base + (25 - (c.charCodeAt(0) - base)));
			});
			case 'caesar': return text.replace(/[a-zA-Z]/g, c => {
				const base = c < 'a' ? 65 : 97;
				return String.fromCharCode(((c.charCodeAt(0) - base - caesarShift + 26) % 26) + base);
			});
			default: return text;
		}
	} else {
		switch (encoding) {
			case 'base64': return Buffer.from(text, 'utf8').toString('base64');
			case 'base64url': return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
			case 'hex': return Buffer.from(text, 'utf8').toString('hex');
			case 'url': return encodeURIComponent(text);
			case 'rot13': return text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13)));
			case 'binary': return text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
			case 'atbash': return text.replace(/[a-zA-Z]/g, c => {
				const base = c < 'a' ? 65 : 97;
				return String.fromCharCode(base + (25 - (c.charCodeAt(0) - base)));
			});
			case 'caesar': return text.replace(/[a-zA-Z]/g, c => {
				const base = c < 'a' ? 65 : 97;
				return String.fromCharCode(((c.charCodeAt(0) - base + caesarShift) % 26) + base);
			});
			default: return text;
		}
	}
}

interface HashMatch { algorithm: string; confidence: 'high' | 'medium' | 'low'; length: number }

function identifyHash(hash: string): { input: string; length: number; candidates: HashMatch[] } {
	const len = hash.length;
	const isHex = /^[0-9a-fA-F]+$/.test(hash);
	const candidates: HashMatch[] = [];

	if (isHex) {
		if (len === 32) { candidates.push({ algorithm: 'MD5', confidence: 'high', length: len }); }
		if (len === 40) { candidates.push({ algorithm: 'SHA-1', confidence: 'high', length: len }); }
		if (len === 56) { candidates.push({ algorithm: 'SHA-224', confidence: 'high', length: len }); }
		if (len === 64) { candidates.push({ algorithm: 'SHA-256', confidence: 'high', length: len }); }
		if (len === 96) { candidates.push({ algorithm: 'SHA-384', confidence: 'high', length: len }); }
		if (len === 128) { candidates.push({ algorithm: 'SHA-512', confidence: 'high', length: len }); }
		if (len === 32) { candidates.push({ algorithm: 'NTLM', confidence: 'medium', length: len }); }
		if (len === 8) { candidates.push({ algorithm: 'CRC-32', confidence: 'medium', length: len }); }
	}
	if (/^\$2[ayb]\$/.test(hash)) { candidates.push({ algorithm: 'bcrypt', confidence: 'high', length: len }); }
	if (/^\$apr1\$/.test(hash)) { candidates.push({ algorithm: 'APR1 MD5', confidence: 'high', length: len }); }
	if (/^\$1\$/.test(hash)) { candidates.push({ algorithm: 'MD5-crypt', confidence: 'high', length: len }); }
	if (/^\$5\$/.test(hash)) { candidates.push({ algorithm: 'SHA-256-crypt', confidence: 'high', length: len }); }
	if (/^\$6\$/.test(hash)) { candidates.push({ algorithm: 'SHA-512-crypt', confidence: 'high', length: len }); }
	if (/^[A-Za-z0-9+/]{22}(==)?$/.test(hash) && len === 24) { candidates.push({ algorithm: 'MD5 (Base64)', confidence: 'medium', length: len }); }

	if (candidates.length === 0) {
		candidates.push({ algorithm: 'Unknown', confidence: 'low', length: len });
	}

	return { input: hash, length: len, candidates };
}

function xorBrute(ciphertextHex: string, topN: number): Array<{ key: number; keyChar: string; plaintext: string; score: number }> {
	const bytes = Buffer.from(ciphertextHex.replace(/\s/g, ''), 'hex');

	// English letter frequency scoring
	const freq: Record<string, number> = { e: 12.7, t: 9.1, a: 8.2, o: 7.5, i: 7.0, n: 6.7, s: 6.3, h: 6.1, r: 6.0, d: 4.3, l: 4.0, u: 2.8 };
	const scoreText = (text: string): number => {
		let score = 0;
		for (const ch of text.toLowerCase()) {
			score += freq[ch] ?? (ch >= ' ' && ch <= '~' ? 0.5 : -20);
		}
		return score;
	};

	const results = [];
	for (let key = 0; key < 256; key++) {
		const plain = Buffer.from(bytes.map((b: number) => b ^ key)).toString('utf8');
		const score = scoreText(plain);
		results.push({ key, keyChar: String.fromCharCode(key), plaintext: plain, score: Math.round(score * 10) / 10 });
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, topN);
}

function extractFlags(text: string): string[] {
	const patterns = [
		/(?:CTF|FLAG|DUCTF|picoCTF|HTB|THM|TUCTF|PicoCTF|nahamcon|flag)\{[^}]+\}/gi,
		/[A-Z]{2,8}\{[a-zA-Z0-9_!@#$%^&*\-+=.?]+\}/g,
	];
	const found = new Set<string>();
	for (const pat of patterns) {
		const matches = text.match(pat);
		if (matches) { matches.forEach(m => found.add(m)); }
	}
	return Array.from(found);
}

interface DecodeAttempt { method: string; result: string; looksValid: boolean }

function autoDecode(text: string): DecodeAttempt[] {
	const attempts: DecodeAttempt[] = [];
	const isPrintable = (s: string) => /^[\x20-\x7e\n\r\t]+$/.test(s) && s.length > 0;

	const tryDecode = (method: string, fn: () => string) => {
		try {
			const result = fn();
			attempts.push({ method, result, looksValid: isPrintable(result) });
		} catch {
			// skip silently
		}
	};

	tryDecode('base64', () => Buffer.from(text.trim(), 'base64').toString('utf8'));
	tryDecode('base64url', () => Buffer.from(text.trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
	tryDecode('hex', () => Buffer.from(text.replace(/\s+/g, ''), 'hex').toString('utf8'));
	tryDecode('url', () => decodeURIComponent(text));
	tryDecode('rot13', () => text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13))));
	tryDecode('binary', () => text.split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join(''));
	tryDecode('ascii-codes', () => text.split(/[\s,]+/).map(n => String.fromCharCode(parseInt(n))).join(''));

	return attempts.filter(a => a.looksValid);
}
