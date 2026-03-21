# HCode MCP Remote Deployment and Hardening

This guide covers how to expose HCode MCP beyond localhost with a minimum secure baseline.

## Security Baseline

- Keep `hcode.mcp.requireAuth` enabled for any non-local deployment.
- Set a strong bearer token with `HCode MCP: Set MCP Auth Token`.
- Restrict inbound access to trusted IPs using firewall rules.
- Terminate TLS at a reverse proxy and only forward to localhost MCP.
- Keep `hcode.mcp.allowedOrigins` as tight as possible.
- Rotate auth tokens periodically and after any incident.

## Local MCP Configuration

Recommended HCode settings:

- `hcode.mcp.port`: a dedicated port (for example `6767`).
- `hcode.mcp.requireAuth`: `true`.
- `hcode.mcp.allowedOrigins`: exact origins for UI callers only.

Keep the MCP service loopback-bound whenever possible and expose remote access through a proxy layer.

## Reverse Proxy Pattern

Run HCode MCP locally, then publish through NGINX/Caddy/Traefik.

### NGINX Example

```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;

    ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

    location /mcp {
        proxy_pass http://127.0.0.1:6767/mcp;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Optional extra gateway-level auth in addition to MCP bearer token.
        # auth_basic "Restricted";
        # auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

## Network Controls

- Allow inbound `443` from trusted CIDRs only.
- Deny direct inbound traffic to local MCP port (`6767`) from external interfaces.
- Keep SSH management access restricted and key-based where possible.

## Operational Hardening

- Run HCode under a non-root account.
- Centralize proxy logs and monitor failed auth attempts.
- Alert on unusual request rates and repeated 401/403 responses.
- Back up and protect configuration containing allowed origins and endpoint hostnames.

## Validation Checklist

- `hcode.mcp.requireAuth` is enabled.
- Bearer token is set and tested.
- Proxy TLS is valid and uses modern ciphers.
- Direct port access to MCP from external network is blocked.
- Only approved origins can access browser-based MCP calls.
- Remote agent can connect through proxy and invoke a simple read-only tool call.
