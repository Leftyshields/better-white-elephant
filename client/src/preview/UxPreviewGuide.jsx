/**
 * Fixed party links for reviewers (IDs match scripts/ux-preview/seed-lib.mjs).
 */
import { Link } from 'react-router-dom';

const PREVIEW_PARTIES = [
  { id: 'ux-preview-lobby', label: 'Lobby', status: 'LOBBY' },
  { id: 'ux-preview-active', label: 'Active game', status: 'ACTIVE' },
  { id: 'ux-preview-ended', label: 'Ended game', status: 'ENDED' },
];

export function UxPreviewGuide() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 z-20 relative">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <p className="font-medium mb-2">UX preview environment (isolated from production)</p>
        <p className="text-amber-200/80 mb-2">
          Sign in with the seeded reviewer account (see docs/dev/ux-preview.md). Seeded parties:
        </p>
        <ul className="flex flex-wrap gap-3">
          {PREVIEW_PARTIES.map((party) => (
            <li key={party.id}>
              <Link
                to={`/party/${party.id}`}
                className="underline hover:text-white"
              >
                {party.label} ({party.status})
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
