// The one-tap backup on a session's last screen (SPEC.md section 8, Q25): when
// the last copy saved by hand is a week old, or there's none, offer one. The
// tap opens the share sheet, where Save to Files reaches iCloud Drive.

import { useState } from 'preact/hooks';
import { localDate } from '../data';
import { daysBetween } from '../engine';
import { exportBackup } from './backups';
import { useApp } from './store';

export function BackupNow() {
  const { repo, today } = useApp();
  const [saved, setSaved] = useState(false);
  const last = repo.meta().lastExportAt;
  if (saved) return <p class="note ok">Saved a copy.</p>;
  if (last !== null && daysBetween(localDate(new Date(last)), today) < 7) return null;
  return (
    <div class="note">
      <div>{last ? "It's been a week since you saved a copy of your log." : "You haven't saved a copy of your log yet."}</div>
      <div class="btn-row">
        <button type="button" class="chip" onClick={() => void exportBackup(repo, today).then((r) => r !== 'cancelled' && setSaved(true))}>
          Back up now
        </button>
      </div>
    </div>
  );
}
