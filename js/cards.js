// Card model + encoding. A card is a string token like "Th" (ten of hearts),
// "Ks" (king of spades). Rank chars: A K Q J T 9..2. Suit chars: s h d c.
window.PT = window.PT || {};

PT.cards = (function () {
  const RANK_CHARS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const SUIT_CHARS = ['s', 'h', 'd', 'c'];

  const RANK_VALUE = {};
  RANK_CHARS.forEach((ch, i) => {
    RANK_VALUE[ch] = i + 2; // '2' -> 2 ... 'A' -> 14
  });

  const RANK_DISPLAY = { T: '10' };
  const SUIT_DISPLAY = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const RED_SUITS = { h: true, d: true };

  const FULL_DECK = (function () {
    const deck = [];
    for (const r of RANK_CHARS) {
      for (const s of SUIT_CHARS) {
        deck.push(r + s);
      }
    }
    return deck;
  })();

  function isCard(token) {
    return (
      typeof token === 'string' &&
      token.length === 2 &&
      Object.prototype.hasOwnProperty.call(RANK_VALUE, token[0]) &&
      SUIT_CHARS.includes(token[1])
    );
  }

  function rankValue(card) {
    return RANK_VALUE[card[0]];
  }

  function suit(card) {
    return card[1];
  }

  function isRed(card) {
    return RED_SUITS[card[1]] === true;
  }

  function rankLabel(card) {
    const ch = card[0];
    return RANK_DISPLAY[ch] || ch;
  }

  function suitLabel(card) {
    return SUIT_DISPLAY[card[1]];
  }

  // Parse a packed string ("ThKs") into an array of card tokens.
  function parseCards(packed) {
    if (typeof packed !== 'string' || packed.length % 2 !== 0) {
      return null;
    }
    const cards = [];
    for (let i = 0; i < packed.length; i += 2) {
      const token = packed[i] + packed[i + 1];
      if (!isCard(token)) {
        return null;
      }
      cards.push(token);
    }
    return cards;
  }

  function packCards(cards) {
    return cards.join('');
  }

  function deckWithout(usedCards) {
    const used = new Set(usedCards);
    return FULL_DECK.filter((card) => !used.has(card));
  }

  function hasDuplicates(cards) {
    return new Set(cards).size !== cards.length;
  }

  return {
    RANK_CHARS,
    SUIT_CHARS,
    FULL_DECK,
    isCard,
    rankValue,
    suit,
    isRed,
    rankLabel,
    suitLabel,
    parseCards,
    packCards,
    deckWithout,
    hasDuplicates,
  };
})();
