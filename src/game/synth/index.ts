export { createOrchestra, type Orchestra, type OrchestraOptions } from './orchestra';
export {
  FORBIDDEN_INTERVALS,
  arrange,
  clashes,
  parseKey,
  type ArrangeOptions,
  type Arrangement,
  type ChordSpan,
  type Part,
  type PartNote,
} from './arrange';
export {
  DUCK_DB,
  DUCK_HALF_SECONDS,
  beatTime,
  duckWindows,
  notesSoundingAt,
  scheduleOrchestra,
  type DuckWindow,
  type TimedNote,
} from './schedule';
export {
  LEVEL_LABEL,
  PERCUSSION_COMBO,
  SECTION_ORDER,
  levelFor,
  sectionsFor,
  type OrchestraDrive,
  type OrchestraLevel,
} from './sections';
export { countIn, type CountInBeat, type CountInOptions } from './metronome';
export {
  DEFAULT_ORCHESTRA_SETTINGS,
  DEFAULT_ORCHESTRA_VOLUME,
  ORCHESTRA_STORAGE_KEY,
  loadOrchestraSettings,
  saveOrchestraSettings,
  volumeLabel,
  type OrchestraSettings,
} from './settings';
