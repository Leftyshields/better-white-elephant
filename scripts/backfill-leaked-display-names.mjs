#!/usr/bin/env node
/**
 * One-time backfill: clear displayName values that equal the account email local-part
 * or contain a full email address.
 *
 * Defaults to dry-run (counts only). Pass --apply to write changes.
 * Requires --project <firebase-project-id> and Application Default Credentials.
 *
 * Safe to run in staging by an operator; do not run unattended against production.
 */

import process from 'node:process';
import admin from 'firebase-admin';
import {
  isLeakedDisplayNameRecord,
  planLeakedDisplayNameFix,
} from '../server/lib/backfill-leaked-display-names.js';

function parseCliArgs(argv) {
  const apply = argv.includes('--apply');
  const projectFlagIndex = argv.indexOf('--project');
  const projectId =
    projectFlagIndex !== -1 ? argv[projectFlagIndex + 1] : undefined;

  if (!projectId || projectId.startsWith('-')) {
    return { ok: false, error: 'missing_required_flag', flag: '--project' };
  }

  return { ok: true, apply, projectId };
}

function initAdmin(projectId) {
  if (admin.apps.length) {
    return admin.firestore();
  }
  admin.initializeApp({ projectId });
  return admin.firestore();
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function scanUsers(db, apply) {
  const snapshot = await db.collection('users').get();
  let matched = 0;
  let updated = 0;

  for (const userDoc of snapshot.docs) {
    const data = userDoc.data();
    const record = {
      displayName: data.displayName,
      email: data.email,
      name: data.name,
    };
    if (!isLeakedDisplayNameRecord(record)) {
      continue;
    }
    matched += 1;
    if (!apply) {
      continue;
    }
    const plan = planLeakedDisplayNameFix(userDoc.id, record);
    if (!plan) {
      continue;
    }
    await userDoc.ref.set(
      {
        displayName: plan.displayName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    updated += 1;
  }

  return { scanned: snapshot.size, matched, updated };
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function scanParticipantDocs(db, apply) {
  const partiesSnap = await db.collection('parties').get();
  let partiesScanned = 0;
  let participantDocsScanned = 0;
  let matched = 0;
  let updated = 0;

  for (const partyDoc of partiesSnap.docs) {
    partiesScanned += 1;
    const participantsSnap = await partyDoc.ref.collection('participants').get();
    for (const participantDoc of participantsSnap.docs) {
      participantDocsScanned += 1;
      const data = participantDoc.data();
      if (data.displayName == null || data.displayName === '') {
        continue;
      }

      let email = typeof data.email === 'string' ? data.email : null;
      if (!email) {
        const userDoc = await db.collection('users').doc(participantDoc.id).get();
        if (userDoc.exists) {
          email = userDoc.data()?.email ?? null;
        }
      }

      const record = {
        displayName: data.displayName,
        email,
        name: data.name,
      };

      if (!isLeakedDisplayNameRecord(record)) {
        continue;
      }

      matched += 1;
      if (!apply) {
        continue;
      }

      const plan = planLeakedDisplayNameFix(participantDoc.id, record);
      if (!plan) {
        continue;
      }

      await participantDoc.ref.set(
        {
          displayName: plan.displayName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      updated += 1;
    }
  }

  return { partiesScanned, participantDocsScanned, matched, updated };
}

async function main() {
  const parsed = parseCliArgs(process.argv);
  if (!parsed.ok) {
    console.error(JSON.stringify({ error: parsed.error, flag: parsed.flag }));
    process.exitCode = 1;
    return;
  }

  const { apply, projectId } = parsed;

  console.log(
    JSON.stringify({
      projectId,
      mode: apply ? 'apply' : 'dry-run',
    }),
  );

  const db = initAdmin(projectId);
  const userStats = await scanUsers(db, apply);
  const participantStats = await scanParticipantDocs(db, apply);

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    users: {
      documentsScanned: userStats.scanned,
      leakedDisplayNameMatches: userStats.matched,
      documentsUpdated: userStats.updated,
    },
    partyParticipants: {
      partiesScanned: participantStats.partiesScanned,
      participantDocumentsScanned: participantStats.participantDocsScanned,
      leakedDisplayNameMatches: participantStats.matched,
      documentsUpdated: participantStats.updated,
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!apply && (userStats.matched > 0 || participantStats.matched > 0)) {
    console.error(JSON.stringify({ notice: 'dry_run_only', hint: 'use_apply_flag' }));
    process.exitCode = 0;
  }
}

main().catch(() => {
  console.error(JSON.stringify({ error: 'backfill_failed', code: 'unexpected' }));
  process.exitCode = 1;
});