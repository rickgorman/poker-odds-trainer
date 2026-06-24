// Scenario generation, answer choices, validation, and URL <-> prompt encoding.
window.PT = window.PT || {};

PT.scenario = (function () {
  const cards = PT.cards;
  const equity = PT.equity;
  const rng = PT.rng;

  const MODE = { ODDS: 'odds', BET: 'bet' };
  const MODE_PROFILE_KEY = { odds: 'tellMeTheOdds', bet: 'whatsTheBet' };

  const POT_MIN_UNITS = 8;
  const POT_MAX_UNITS = 60;
  const BET_UNIT = 5;
  const CHOICE_COUNT = 3;
  const MIN_DISTRACTOR_GAP = 5;
  const MAX_DISTRACTOR_GAP = 32;
  const WILL_WIN_BOOST = 8;
  const MAX_WIN_PERCENT = 100;

  function deal(mode, seed) {
    const random = rng.fromString(seed + ':deal');
    const shuffled = rng.shuffle(random, cards.FULL_DECK);

    const hero = [shuffled[0], shuffled[1]];
    const opponent = [shuffled[2], shuffled[3]];
    const boardLength = mode === MODE.BET ? 4 : random() < 0.5 ? 3 : 4;
    const board = shuffled.slice(4, 4 + boardLength);

    let pot = null;
    let call = null;
    if (mode === MODE.BET) {
      pot = rng.int(random, POT_MIN_UNITS, POT_MAX_UNITS) * BET_UNIT;
      const maxCallUnits = Math.max(1, Math.round((pot * 0.6) / BET_UNIT));
      call = rng.int(random, 1, maxCallUnits) * BET_UNIT;
    }

    return { mode, hero, opponent, board, seed, pot, call };
  }

  function validate(params) {
    const { mode, hero, opponent, board, pot, call } = params;

    if (!hero || hero.length !== 2) {
      return 'Prompt requires exactly 2 hero cards';
    }
    if (!opponent || opponent.length !== 2) {
      return 'Prompt requires exactly 2 opponent cards';
    }
    if (mode === MODE.ODDS && (!board || board.length < 3 || board.length > 4)) {
      return 'Odds mode requires 3 or 4 board cards';
    }
    if (mode === MODE.BET && (!board || board.length !== 4)) {
      return 'Bet mode requires exactly 4 board cards';
    }
    if (cards.hasDuplicates(hero.concat(opponent, board))) {
      return 'Duplicate known card';
    }
    if (mode === MODE.BET && !(pot > 0)) {
      return 'Pot must be positive';
    }
    if (mode === MODE.BET && !(call > 0)) {
      return 'Call must be positive';
    }
    return null;
  }

  function reflectIntoRange(value) {
    let result = value;
    if (result < 0) {
      result = -result;
    }
    if (result > 100) {
      result = 100 - (result - 100);
    }
    return Math.max(0, Math.min(100, result));
  }

  // Two plausible wrong percentages plus the correct one, ordered by the seed.
  function buildChoices(seed, correctPercent) {
    const random = rng.fromString(seed + ':choices');
    const values = new Set([correctPercent]);

    let guard = 0;
    while (values.size < CHOICE_COUNT && guard < 200) {
      guard += 1;
      const magnitude = rng.int(random, MIN_DISTRACTOR_GAP, MAX_DISTRACTOR_GAP);
      const sign = random() < 0.5 ? -1 : 1;
      values.add(reflectIntoRange(correctPercent + sign * magnitude));
    }

    let filler = 0;
    while (values.size < CHOICE_COUNT) {
      if (!values.has(filler)) {
        values.add(filler);
      }
      filler += 1;
    }

    return rng.shuffle(random, Array.from(values));
  }

  function build(params, options) {
    const settings = options || {};
    const error = validate(params);
    if (error) {
      return { error };
    }

    const { mode, hero, opponent, board, seed } = params;
    const result = equity.evaluateMatchup(hero, opponent, board);

    const scenario = {
      mode,
      hero,
      opponent,
      board,
      seed,
      pot: params.pot,
      call: params.call,
      equity: result,
      paramKey: paramKey(params),
    };

    if (mode === MODE.ODDS) {
      scenario.basePercent = Math.round(result.winChance * 100);
      scenario.willOnPhone = settings.willOnPhone === true;
      scenario.correctPercent = scenario.willOnPhone
        ? Math.min(MAX_WIN_PERCENT, scenario.basePercent + WILL_WIN_BOOST)
        : scenario.basePercent;
      scenario.choices = buildChoices(seed, scenario.correctPercent);
    } else {
      scenario.requiredEquity = equity.requiredEquity(params.pot, params.call);
      scenario.maxCorrectCall = equity.maxCorrectCall(result.winChance, params.pot);
      scenario.brookInHand = settings.brookInHand === true;
      scenario.correctAction = scenario.brookInHand
        ? 'Call'
        : result.winChance >= scenario.requiredEquity
        ? 'Call'
        : 'Fold';
    }

    return scenario;
  }

  function generate(mode, options) {
    const normalizedMode = mode === MODE.BET ? MODE.BET : MODE.ODDS;
    let attempt = 0;
    while (attempt < 5) {
      attempt += 1;
      const scenario = build(deal(normalizedMode, rng.makeSeed()), options);
      if (!scenario.error) {
        return scenario;
      }
    }
    return build(deal(normalizedMode, rng.makeSeed()), options);
  }

  // Stable identifier used both as the profile history key and (minus mode) the
  // URL query string. Field order mirrors the original trainer.
  function paramKey(params) {
    const parts = [
      'mode=' + params.mode,
      'hero=' + cards.packCards(params.hero),
      'opponent=' + cards.packCards(params.opponent),
      'board=' + cards.packCards(params.board),
    ];
    if (params.mode === MODE.BET) {
      parts.push('pot=' + params.pot, 'call=' + params.call);
    }
    parts.push('seed=' + params.seed);
    return parts.join('&');
  }

  function toQueryString(scenario) {
    const parts = [
      'hero=' + cards.packCards(scenario.hero),
      'opponent=' + cards.packCards(scenario.opponent),
      'board=' + cards.packCards(scenario.board),
    ];
    if (scenario.mode === MODE.BET) {
      parts.push('pot=' + scenario.pot, 'call=' + scenario.call);
    }
    parts.push('seed=' + scenario.seed);
    return parts.join('&');
  }

  function parseHash(hash) {
    const cleaned = hash.replace(/^#/, '').replace(/^\//, '');
    const [path, query] = cleaned.split('?');
    const mode = path === MODE.BET ? MODE.BET : MODE.ODDS;
    if (!query) {
      return { mode, params: null };
    }

    const raw = {};
    for (const pair of query.split('&')) {
      const [key, value] = pair.split('=');
      if (key) {
        raw[key] = decodeURIComponent(value || '');
      }
    }

    const hero = cards.parseCards(raw.hero);
    const opponent = cards.parseCards(raw.opponent);
    const board = cards.parseCards(raw.board);
    if (!hero || !opponent || !board || !raw.seed) {
      return { mode, params: null, invalid: true };
    }

    const params = { mode, hero, opponent, board, seed: raw.seed };
    if (mode === MODE.BET) {
      params.pot = Number(raw.pot);
      params.call = Number(raw.call);
    }
    return { mode, params };
  }

  return {
    MODE,
    MODE_PROFILE_KEY,
    generate,
    build,
    validate,
    toQueryString,
    parseHash,
  };
})();
