# thought-unit-reader — standing instructions

## Production Firebase policy

This project (Avrrio Reader) uses Firebase in production: Auth, Firestore
(`firestore.rules`, `firestore.indexes.json`), and Storage, initialized in
`lib/firebase.ts` (client SDK) and used throughout the app (e.g.
`lib/pdrmFirestore.ts`). There is no Cloud Functions directory and no
`firebase-admin` usage in the app code today; if that changes, this policy
covers Functions deploys too.

**You may inspect, analyze, query, and prepare changes without approval.**
You must not create, modify, deploy, migrate, delete, disable, reset, or
otherwise mutate any production Firebase resource unless Brian explicitly
approves the exact proposed action in the current conversation. Before
requesting approval, show the affected resource, the proposed change, the
expected impact, the risk level, and the rollback procedure. Destructive
operations require an additional explicit warning and a backup/recovery
plan. Never interpret a general instruction such as "fix it" as permission
to mutate production.

**Approval gate covers:**
- creating, editing, or deleting Firestore documents/collections
- changing Firebase Security Rules (`firestore.rules`, Storage rules)
- changing indexes (`firestore.indexes.json`)
- changing Authentication settings or users
- modifying Storage objects or rules
- deploying Functions
- changing environment variables/secrets
- changing IAM/service-account permissions
- disabling services
- deleting anything
- production deploys (`firebase deploy`, hosting releases)

**Normal workflow:**
```
Inspect production Firebase
      ↓
Diagnose problem
      ↓
Prepare exact proposed change
      ↓
Show Brian:
  • what will change
  • why
  • files/resources affected
  • rollback plan
  • risk level
      ↓
BRIAN APPROVES
      ↓
Apply change
      ↓
Verify result
      ↓
Report exactly what changed
```

**Destructive operations (delete / reset / migration) — stricter:**
```
No automatic execution
        ↓
Explicit approval from Brian
        ↓
Backup/checkpoint first
        ↓
Execute
        ↓
Verify
```

**IAM / service-account note.** A prompt policy alone doesn't stop a session
holding a broad admin credential from bypassing it — if you (or the
environment) have an unrestricted `firebase-adminsdk-...` service account
available, that key can technically read *and* write regardless of what
this file says. The intended setup is two separate identities: a read-only
`avrrio-ai-prod-viewer`-style credential for everyday inspection, and a
separate, more privileged deploy/write identity used only for an
already-approved change. If you ever find yourself with write/admin
Firebase or GCP credentials in this environment by default, say so — that's
a real gap between this policy and what's actually enforced, not something
to quietly route around. Provisioning or changing IAM roles/service
accounts is itself a production mutation and falls under the approval gate
above; it's an action item for Brian in the Firebase/GCP console, not
something to do from this session even to "improve" the gate.
