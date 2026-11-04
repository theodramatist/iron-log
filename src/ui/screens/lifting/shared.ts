import type { LiftingDraft } from '../../session/lifting';

/** Every tap hands the next draft to the session, which saves it. */
export type Update = (next: LiftingDraft) => void;
