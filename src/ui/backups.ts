// Backups (SPEC.md section 8): export through the share sheet, import with a
// confirmation, and the weekly reminder.

import { backupFileName, parseBackup, serializeBackup, type ParseResult, type Repository } from '../data';
import { daysBetween, weekdayIndex, type AnyEvent, type LocalDate } from '../engine';

const FRIDAY = 4;

/**
 * "After Friday's session, if there has been no export in 7 days, the Today
 * screen shows 'Back up your log'." It stays up until he exports, or until
 * that Friday is a week old.
 */
export function backupReminderDue(events: readonly AnyEvent[], today: LocalDate, lastExport: LocalDate | null): boolean {
  const fridaySession = events.some(
    (e) =>
      (e.type === 'liftingSession' || e.type === 'conditioningSession') &&
      !e.stopped &&
      weekdayIndex(e.date) === FRIDAY &&
      e.date <= today &&
      daysBetween(e.date, today) < 7,
  );
  if (!fridaySession) return false;
  return lastExport === null || daysBetween(lastExport, today) >= 7;
}

export type ExportResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hand the backup file to the share sheet, where the iPhone offers Save to
 * Files and iCloud Drive, or download it where sharing files isn't offered.
 * Call it straight from a tap: the share sheet needs the tap's permission.
 */
export async function exportBackup(repo: Repository, today: LocalDate): Promise<ExportResult> {
  const name = backupFileName(today);
  const file = new File([serializeBackup(repo.backup())], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Iron Log backup' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
    await repo.markExported();
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await repo.markExported();
  return 'downloaded';
}

export async function readBackupFile(file: File): Promise<ParseResult> {
  return parseBackup(await file.text());
}
