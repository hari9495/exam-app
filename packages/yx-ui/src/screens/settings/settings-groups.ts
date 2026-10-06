// All 8 settings groups (APX-D §3), in order. 71 pages.
import { GROUP_1, GROUP_2 } from './registry-g1-g2';
import { GROUP_3 } from './registry-g3';
import { GROUP_4 } from './registry-g4';
import { GROUP_5, GROUP_6 } from './registry-g5-g6';
import { GROUP_7, GROUP_8 } from './registry-g7-g8';
import type { SettingsGroupDef } from './settings-types';
import { cleanGroups } from './settings-logic';

/** Loaded once with every user-facing text in plain words (internal codes removed). */
export const SETTINGS_GROUPS: SettingsGroupDef[] = cleanGroups([GROUP_1, GROUP_2, GROUP_3, GROUP_4, GROUP_5, GROUP_6, GROUP_7, GROUP_8]);
