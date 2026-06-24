// Player profile persisted to localStorage: per-mode tallies + streaks, and a
// history of answered prompts. weakSpots/settings are reserved for future use.
window.PT = window.PT || {};

PT.profile = (function () {
  const STORAGE_KEY = 'odds.playerProfile.v1';
  const PROFILE_VERSION = 1;
  const MODE_KEYS = ['tellMeTheOdds', 'whatsTheBet'];

  function emptyMode() {
    return { answered: 0, correct: 0, currentStreak: 0, bestStreak: 0 };
  }

  function emptyProfile() {
    return {
      version: PROFILE_VERSION,
      modes: { tellMeTheOdds: emptyMode(), whatsTheBet: emptyMode() },
      weakSpots: {},
      answeredPrompts: {},
      settings: {},
    };
  }

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function normalize(raw) {
    const base = emptyProfile();
    if (!isObject(raw)) {
      return base;
    }
    if (isObject(raw.modes)) {
      for (const key of MODE_KEYS) {
        const mode = raw.modes[key];
        if (isObject(mode)) {
          base.modes[key] = {
            answered: Number(mode.answered) || 0,
            correct: Number(mode.correct) || 0,
            currentStreak: Number(mode.currentStreak) || 0,
            bestStreak: Number(mode.bestStreak) || 0,
          };
        }
      }
    }
    if (isObject(raw.weakSpots)) {
      base.weakSpots = raw.weakSpots;
    }
    if (isObject(raw.answeredPrompts)) {
      base.answeredPrompts = raw.answeredPrompts;
    }
    if (isObject(raw.settings)) {
      base.settings = raw.settings;
    }
    return base;
  }

  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch (err) {
      return emptyProfile();
    }
  }

  function save(profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (err) {
      /* storage unavailable — keep running in-memory */
    }
  }

  function record(profile, entry) {
    const modeKey = PT.scenario.MODE_PROFILE_KEY[entry.mode];
    const stats = profile.modes[modeKey];

    stats.answered += 1;
    if (entry.correct) {
      stats.correct += 1;
      stats.currentStreak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    } else {
      stats.currentStreak = 0;
    }

    profile.answeredPrompts[entry.key] = {
      mode: entry.mode,
      answeredAt: new Date().toISOString(),
      selected: entry.selected,
      correct: entry.correct,
    };

    save(profile);
    return profile;
  }

  return { STORAGE_KEY, emptyProfile, load, save, record };
})();
