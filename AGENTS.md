# Avrrio Reader repository instructions

## Firebase rules for Avrrio Reader

Firebase is the shared, live persistence and authentication backend for Avrrio Reader and related learning state. You may inspect existing Firebase usage, schemas, collections, indexes, authentication flows, Storage paths, and Firestore reads and writes as needed to complete an approved task.

### Allowed without additional approval

You may:

- read existing Firebase configuration and code;
- trace Firestore, Storage, and Authentication usage;
- add non-destructive reads and writes required by an approved feature;
- add new collections, documents, or fields when they are backward-compatible and clearly scoped;
- add indexes or security-rule changes when required for the approved feature, provided they do not weaken security;
- write additive, reversible migrations;
- add tests and diagnostics for Firebase behavior.

### Brian's explicit approval is required

Do not do any of the following without explicit approval from Brian:

- delete a collection, document family, Storage path, or user data;
- rename or move existing production collections in a way that breaks old clients;
- wipe or reset Firestore;
- delete Firebase Authentication users;
- remove or weaken security rules;
- rotate keys or secrets;
- change billing or project ownership;
- migrate to another Firebase project;
- run irreversible data migrations;
- mass-update existing production records without first providing a dry-run report.

### Schema-change requirements

For every Firebase schema change:

1. Inspect current production-facing code first.
2. Identify every reader and writer of the affected schema.
3. Prefer additive fields over destructive replacement.
4. Preserve backward compatibility.
5. Provide a migration plan.
6. Include rollback behavior.
7. Report exactly which Firebase resources will change before applying anything risky.

For NoteLab, Recall, TestLab, Learning State, Whiteboard snapshots, Sticky Notes, Elena Mode, and other Avrrio features, use stable IDs based on the real `resolvedDocumentId` or canonical concept identity. Do not use filename-only IDs or page-number-only keys.

Do not duplicate the same learning data into multiple unrelated Firebase collections unless there is a documented reason. Prefer one canonical source of truth with derived views.

Never expose Firebase Admin credentials, API keys, service-account JSON, tokens, or secret values in logs, commits, pull-request descriptions, screenshots, or client code.

If a requested feature requires deleting or restructuring production Firebase data, stop before making the change and report:

- what must change;
- why it must change;
- affected collections and documents;
- migration risk;
- the proposed backup and rollback plan;
- the exact command or action you would take.

Wait for Brian's explicit approval before proceeding.

In short: Firebase may be used to implement and test approved Avrrio features, but Brian must approve destructive, irreversible, security-sensitive, or project-level Firebase changes.

### Product architecture rule

Firebase stores durable state; it must not become the intelligence layer. Thought Units, Knowledge Graph identity, Learning State, NoteLab scenes, Recall progress, and TestLab results may persist in Firebase, but the application's semantic logic must remain in code so the product architecture is not locked into Firestore documents.
