// Single-card-to-come equity. Every remaining unseen card is dealt as the final
// community card; we count how many make the hero win (outs) versus tie (push).
// Win chance excludes pushes from the numerator but keeps them in the denominator.
window.PT = window.PT || {};

PT.equity = (function () {
  const cards = PT.cards;
  const evaluator = PT.evaluator;

  function evaluateMatchup(hero, opponent, board) {
    const known = hero.concat(opponent, board);
    const remaining = cards.deckWithout(known);

    const winningCards = [];
    let pushes = 0;

    for (const next of remaining) {
      const finalBoard = board.concat(next);
      const heroScore = evaluator.evaluate(hero.concat(finalBoard));
      const opponentScore = evaluator.evaluate(opponent.concat(finalBoard));
      const result = evaluator.compare(heroScore, opponentScore);

      if (result > 0) {
        winningCards.push(next);
      } else if (result === 0) {
        pushes += 1;
      }
    }

    const remainingCount = remaining.length;
    const outs = winningCards.length;
    const winChance = remainingCount === 0 ? 0 : outs / remainingCount;

    return {
      outs,
      pushes,
      remaining: remainingCount,
      winChance,
      winningCards,
    };
  }

  // Pot odds: minimum win share needed for a call to break even.
  function requiredEquity(pot, call) {
    return call / (pot + call);
  }

  // Largest call amount that is still break-even-or-better at this win chance.
  function maxCorrectCall(winChance, pot) {
    if (winChance >= 1) {
      return Infinity;
    }
    return Math.floor((winChance / (1 - winChance)) * pot);
  }

  return { evaluateMatchup, requiredEquity, maxCorrectCall };
})();
