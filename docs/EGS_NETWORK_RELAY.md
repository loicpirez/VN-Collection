# EGS Network Relay

## Purpose

ErogameScape can be reachable from an operator workstation while rejecting or
timing out from a data-center address. Browser reachability is therefore not a
valid test of the application's outbound route. VN Collection supports a
provider-specific proxy so only EGS traffic needs an alternate egress path.

The production pattern is a reverse dynamic SSH forwarding socket bound to
loopback on the application host. A supervised workstation or relay host in an
allowed region initiates the SSH session. The application uses that socket as
a `socks5h` proxy, including remote DNS resolution.

## Security Properties

- Bind the remote SOCKS listener to `127.0.0.1`, never a public interface.
- Authenticate the relay with a dedicated SSH key and `BatchMode=yes`.
- Keep `GatewayPorts` disabled on the application host.
- Restrict the SSH account and key using the normal host access policy.
- Store the application environment as `root:<application-group>` with mode
  `0640`; never make proxy settings world-readable.
- Route only the `egs` provider through the relay. VNDB and stock providers
  keep their own independent network configuration.
- Do not log SQL response bodies, proxy credentials, or environment contents.

## Relay Command

Run the connection from the trusted egress host. Substitute values from the
deployment inventory rather than committing a host name, user name, or key
path.

```sh
ssh -N -T \
  -i "${SSH_KEY}" \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o TCPKeepAlive=yes \
  -R "127.0.0.1:${REMOTE_SOCKS_PORT}" \
  "${DEPLOY_USER}@${APPLICATION_HOST}"
```

The `-R` argument intentionally has no destination. OpenSSH then creates a
remote dynamic SOCKS listener. Run this command under the host's service
manager (`launchd`, `systemd`, or an equivalent supervisor) with restart-on-
failure and start-on-boot enabled.

## Application Configuration

Configure the EGS provider on the application host:

```text
EGS_PROXY_ENABLED=true
EGS_PROXY_PROTOCOL=socks5h
EGS_PROXY_HOST=127.0.0.1
EGS_PROXY_PORT=<REMOTE_SOCKS_PORT>
EGS_PROXY_USERNAME=
EGS_PROXY_PASSWORD=
```

Restart the application after changing the root-managed environment. Confirm
that its owner, group, and `0640` mode still match the deployment runbook before
deploying another release.

## Verification

Verify every layer independently:

1. The relay supervisor reports the SSH process as running and has no repeated
   exit loop.
2. The application host has a loopback listener on the configured port.
3. A POST to the EGS SQL form succeeds through that SOCKS listener from the
   application host.
4. The EGS proxy test in **Settings > Integrations** reports HTTP `200`.
5. `/top-ranked?tab=egs` renders ranked rows without the unreachable warning.
6. A release deployment succeeds and the same checks still pass afterward.

Do not use a browser on the relay host as the only verification; that bypasses
the reverse tunnel and the application's proxy code.

## Failure Behavior

Paged EGS feeds use stale-while-error. If a successful cached page exists, the
application keeps the rows visible and marks the snapshot as stale with its
last update time. If no cached page exists, the page explains that the
application server could not reach EGS and links directly to the integration
settings. Other providers remain unaffected.

## Recovery

1. Confirm that the trusted egress host is online and its supervisor is active.
2. Inspect the supervisor's bounded error log for SSH authentication, host-key,
   or remote-forwarding failures.
3. Confirm that no stale SSH process still owns the remote port.
4. Restart only the relay service and repeat the verification sequence.
5. If EGS rejects the relay address, move the relay to another approved egress
   host and repeat the tests before changing production.

## Rollback

1. Set `EGS_PROXY_ENABLED=false` or restore the previous EGS proxy values.
2. Restart the application and verify health.
3. Stop and disable the relay supervisor.
4. Confirm that the loopback listener is gone.

Rollback does not delete EGS caches. Existing valid snapshots remain available
for the normal stale-cache fallback.
