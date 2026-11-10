/** True only on the source-table RT app (`reliability-hub-src`). Gold nolk stays false. */
export const SOURCE_MODE = import.meta.env.VITE_RELIABILITY_SOURCE === 'true';
