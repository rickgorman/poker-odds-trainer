// Poker hand evaluator. Scores any 5, 6, or 7 card set and returns a comparable
// array [category, ...tiebreakers] where higher compares as the stronger hand.
window.PT = window.PT || {};

PT.evaluator = (function () {
  const cards = PT.cards;

  const CATEGORY = {
    HIGH_CARD: 0,
    PAIR: 1,
    TWO_PAIR: 2,
    TRIPS: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    QUADS: 7,
    STRAIGHT_FLUSH: 8,
  };

  const MIN_CARDS = 5;
  const MAX_CARDS = 7;

  // Highest straight present in a set of rank values, or null. Handles the
  // 5-high wheel (A-2-3-4-5) by treating an ace as low.
  function bestStraightHigh(rankValues) {
    const present = new Array(15).fill(false);
    for (const value of rankValues) {
      present[value] = true;
    }
    if (present[14]) {
      present[1] = true;
    }
    for (let high = 14; high >= 5; high--) {
      if (
        present[high] &&
        present[high - 1] &&
        present[high - 2] &&
        present[high - 3] &&
        present[high - 4]
      ) {
        return high;
      }
    }
    return null;
  }

  function descending(values) {
    return values.slice().sort((a, b) => b - a);
  }

  function evaluate(handCards) {
    if (handCards.length < MIN_CARDS || handCards.length > MAX_CARDS) {
      throw new Error('Hand evaluation requires 5 to 7 cards');
    }

    const values = handCards.map(cards.rankValue);

    const countByRank = {};
    for (const value of values) {
      countByRank[value] = (countByRank[value] || 0) + 1;
    }

    const cardsBySuit = { s: [], h: [], d: [], c: [] };
    for (const card of handCards) {
      cardsBySuit[cards.suit(card)].push(cards.rankValue(card));
    }

    let flushValues = null;
    for (const suitChar of cards.SUIT_CHARS) {
      if (cardsBySuit[suitChar].length >= 5) {
        flushValues = descending(cardsBySuit[suitChar]);
        break;
      }
    }

    if (flushValues) {
      const straightFlushHigh = bestStraightHigh(flushValues);
      if (straightFlushHigh !== null) {
        return [CATEGORY.STRAIGHT_FLUSH, straightFlushHigh];
      }
    }

    const quadRanks = [];
    const tripRanks = [];
    const pairRanks = [];
    for (const value of Object.keys(countByRank).map(Number).sort((a, b) => b - a)) {
      const count = countByRank[value];
      if (count === 4) {
        quadRanks.push(value);
      } else if (count === 3) {
        tripRanks.push(value);
      } else if (count === 2) {
        pairRanks.push(value);
      }
    }

    if (quadRanks.length > 0) {
      const quad = quadRanks[0];
      const kicker = descending(values.filter((v) => v !== quad))[0];
      return [CATEGORY.QUADS, quad, kicker];
    }

    if (tripRanks.length >= 2) {
      return [CATEGORY.FULL_HOUSE, tripRanks[0], tripRanks[1]];
    }
    if (tripRanks.length === 1 && pairRanks.length >= 1) {
      return [CATEGORY.FULL_HOUSE, tripRanks[0], pairRanks[0]];
    }

    if (flushValues) {
      return [CATEGORY.FLUSH].concat(flushValues.slice(0, 5));
    }

    const straightHigh = bestStraightHigh(values);
    if (straightHigh !== null) {
      return [CATEGORY.STRAIGHT, straightHigh];
    }

    if (tripRanks.length === 1) {
      const trip = tripRanks[0];
      const kickers = descending(values.filter((v) => v !== trip)).slice(0, 2);
      return [CATEGORY.TRIPS, trip].concat(kickers);
    }

    if (pairRanks.length >= 2) {
      const high = pairRanks[0];
      const low = pairRanks[1];
      const kicker = descending(values.filter((v) => v !== high && v !== low))[0];
      return [CATEGORY.TWO_PAIR, high, low, kicker];
    }

    if (pairRanks.length === 1) {
      const pair = pairRanks[0];
      const kickers = descending(values.filter((v) => v !== pair)).slice(0, 3);
      return [CATEGORY.PAIR, pair].concat(kickers);
    }

    return [CATEGORY.HIGH_CARD].concat(descending(values).slice(0, 5));
  }

  // Compare two score arrays. Returns >0 if a beats b, <0 if b beats a, 0 tie.
  function compare(a, b) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
      const av = a[i] === undefined ? -1 : a[i];
      const bv = b[i] === undefined ? -1 : b[i];
      if (av !== bv) {
        return av - bv;
      }
    }
    return 0;
  }

  return { CATEGORY, evaluate, compare };
})();
