# Source-install initialization trust

Initialization and `.env` publication reject writable-by-others ancestors. A
service account's primary group is **not** assumed to be private: another
account may have that group as its primary group, as a supplementary group, or
through directory-service policy.

For an intentional `odin:odin 775` source tree, choose one of these before
deployment:

* Remove group write on the source/data ancestors, retaining owner write.
* Have the machine administrator explicitly delegate an exact numeric service
  UID/group GID pair in `/etc/odin/source-trust.json`:

```json
{"version":1,"trusted_owner_groups":[{"uid":1001,"gid":1001}]}
```

Replace those example IDs with the actual service owner/group IDs. This is an
administrator assertion that **every account able to write through that group
is trusted as the service owner**. Audit both primary and supplementary group
membership and any external identity source before granting it. Delegation is
not inferred from a group name or membership lookup. All service-owned
group-writable ancestors with the delegated GID are covered, not just one clone.

The file and every ancestor must be root-owned, not group/world writable, and
not symlinks. A typical layout is root-owned `/etc/odin` mode 0755 and policy
mode 0644. Missing, malformed, oversized, duplicate-key or untrusted policy
fails closed. Policy changes/revocation take effect on subsequent verification;
state-cache hits revalidate directory trust too.

World-writable directories are never authorized by this delegation. POSIX
access ACLs are also refused on delegated directories: their group mode bits
can be an ACL mask granting unrelated named users write access. Unknown ACL
inspection failures fail closed.

Existing
sticky-ancestor handling (such as `/tmp`) is unchanged. The initialization
terminal directory must still be private (0700), and state and published `.env`
files stay private (0600). No startup path silently chmods operator directories.

An untrusted path remains a startup failure with a diagnostic, not an insecure
fallback listener. This code change does not create the policy or modify a live
installation; deployments of group-writable source trees require the explicit
administrative preparation above.
