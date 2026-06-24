// View + controller: hash routing, rendering, answer handling, scoring.
window.PT = window.PT || {};

(function () {
  const scenario = PT.scenario;
  const cards = PT.cards;
  const profileStore = PT.profile;
  const MODE = scenario.MODE;

  const root = document.getElementById('app');

  let profile = profileStore.load();
  let current = null;
  let answered = null; // { selected, correct }
  let showWinningCards = false;
  let brookInHand = profile.settings.brookInHand === true;
  let willOnPhone = profile.settings.willOnPhone === true;

  function buildOptions() {
    return { brookInHand, willOnPhone };
  }

  function paramsOf(scenario) {
    return {
      mode: scenario.mode,
      hero: scenario.hero,
      opponent: scenario.opponent,
      board: scenario.board,
      seed: scenario.seed,
      pot: scenario.pot,
      call: scenario.call,
    };
  }

  // ---------- formatting ----------

  function percent(fraction) {
    return (fraction * 100).toFixed(1);
  }

  function winChanceText(equity) {
    return percent(equity.winChance) + '% (' + equity.outs + ' / ' + equity.remaining + ')';
  }

  function callLabel(value) {
    return isFinite(value) ? String(value) : '∞';
  }

  // ---------- card markup ----------

  function cardHtml(card) {
    const colorClass = cards.isRed(card) ? 'card-red' : 'card-black';
    return (
      '<span class="playing-card ' + colorClass + '" aria-label="' + card + '">' +
      '<span class="card-rank">' + cards.rankLabel(card) + '</span>' +
      '<span class="card-suit">' + cards.suitLabel(card) + '</span>' +
      '</span>'
    );
  }

  function cardRowWrap(label, list) {
    return (
      '<div class="card-row-wrap">' +
      '<span class="section-label">' + label + '</span>' +
      '<div class="card-row">' + list.map(cardHtml).join('') + '</div>' +
      '</div>'
    );
  }

  function betLine() {
    return (
      '<div class="bet-line" aria-label="Bet details">' +
      '<span>Pot: ' + current.pot + '</span>' +
      '<span>Call: ' + current.call + '</span>' +
      '</div>'
    );
  }

  function promptPanel() {
    let html =
      '<div class="prompt-panel">' +
      cardRowWrap('Opponent hand', current.opponent) +
      cardRowWrap('Board', current.board) +
      cardRowWrap('Player hand', current.hero);
    if (current.mode === MODE.BET) {
      html += betLine();
    }
    return html + '</div>';
  }

  // ---------- answer panel ----------

  function answerButton(label, value, classes) {
    const disabled = answered ? ' disabled' : '';
    return (
      '<button class="' + classes.join(' ') + '" type="button" data-action="answer" ' +
      'data-answer="' + value + '"' + disabled + '>' + label + '</button>'
    );
  }

  function oddsButtons() {
    return current.choices
      .map((choice) => {
        const classes = ['answer-button'];
        if (answered) {
          if (choice === current.correctPercent) {
            classes.push('answer-correct');
          } else if (choice === answered.selected) {
            classes.push('answer-incorrect');
          }
        }
        return answerButton(choice + '%', choice, classes);
      })
      .join('');
  }

  function betButtons() {
    return ['Call', 'Fold']
      .map((action) => {
        const classes = ['answer-button'];
        if (action === 'Call' && brookInHand) {
          classes.push('call-orbit');
        }
        if (answered) {
          if (action === current.correctAction) {
            classes.push('answer-correct');
          } else if (action === answered.selected) {
            classes.push('answer-incorrect');
          }
        }
        return answerButton(action, action, classes);
      })
      .join('');
  }

  function feedbackRow(text, value) {
    return (
      '<div><dt>' + text + '</dt>' +
      '<dd aria-hidden="true">' + value + '</dd></div>'
    );
  }

  function feedbackRows() {
    const equity = current.equity;
    const rows = [];

    if (current.mode === MODE.ODDS) {
      rows.push(feedbackRow('Selected answer ' + answered.selected + '%', answered.selected + '%'));
    } else {
      rows.push(feedbackRow('Selected answer ' + answered.selected, answered.selected));
    }

    rows.push(feedbackRow('Win outs ' + equity.outs, equity.outs));
    rows.push(feedbackRow('Pushes ' + equity.pushes, equity.pushes));
    rows.push(feedbackRow('Remaining cards ' + equity.remaining, equity.remaining));
    rows.push(feedbackRow('Win chance ' + winChanceText(equity), winChanceText(equity)));

    if (current.mode === MODE.BET) {
      const reqText = percent(current.requiredEquity) + '%';
      rows.push(feedbackRow('Required equity ' + reqText, reqText));
      rows.push(
        feedbackRow('Max correct call ' + callLabel(current.maxCorrectCall), callLabel(current.maxCorrectCall))
      );
    }

    return rows.join('');
  }

  function winningCardsSection() {
    const toggleLabel = showWinningCards ? 'Hide winning cards' : 'View winning cards';
    let html =
      '<button class="secondary-button" type="button" data-action="toggle-winning">' +
      toggleLabel + '</button>';
    if (showWinningCards) {
      html +=
        '<div class="winning-cards" aria-label="Winning cards">' +
        current.equity.winningCards.map(cardHtml).join('') +
        '</div>';
    }
    return html;
  }

  function brookNote() {
    if (current.mode !== MODE.BET || !current.brookInHand) {
      return '';
    }
    return '<p class="feedback-note">Brook is in the hand — calling is always correct.</p>';
  }

  function willNote() {
    if (current.mode !== MODE.ODDS || !current.willOnPhone) {
      return '';
    }
    return (
      '<p class="feedback-note">Will is on his phone — win chance boosted 8% (' +
      current.basePercent + '% → ' + current.correctPercent + '%).</p>'
    );
  }

  function revealBlock() {
    const resultClass = answered.correct ? 'result-correct' : 'result-miss';
    const resultText = answered.correct ? 'Correct' : 'Incorrect';
    return (
      '<div class="win-chance-details" aria-label="Win chance details" aria-live="polite">' +
      '<div class="' + resultClass + '">' + resultText + '</div>' +
      '<dl class="feedback-list">' + feedbackRows() + '</dl>' +
      brookNote() +
      willNote() +
      '<p class="feedback-note">Pushes are neutral and do not count as wins.</p>' +
      winningCardsSection() +
      '<button class="next-button" type="button" data-action="next">Next</button>' +
      '</div>'
    );
  }

  function answerPanel() {
    const question = current.mode === MODE.BET ? 'What is the bet?' : 'What is the win chance?';
    const buttons = current.mode === MODE.BET ? betButtons() : oddsButtons();
    const details = answered
      ? revealBlock()
      : '<p class="feedback-placeholder">Answer to see the card math.</p>';
    return (
      '<div class="answer-panel">' +
      '<h2>' + question + '</h2>' +
      '<div class="answer-grid">' + buttons + '</div>' +
      details +
      '</div>'
    );
  }

  // ---------- top bar ----------

  function modeButton(label, mode) {
    const pressed = current && current.mode === mode ? 'true' : 'false';
    return (
      '<button aria-pressed="' + pressed + '" type="button" data-action="mode" data-mode="' + mode + '">' +
      label + '</button>'
    );
  }

  function statsLine() {
    const odds = profile.modes.tellMeTheOdds;
    const bet = profile.modes.whatsTheBet;
    return (
      '<div class="stats-line" aria-label="Session stats">' +
      '<span>Odds ' + odds.correct + '/' + odds.answered + '</span>' +
      '<span>Bet ' + bet.correct + '/' + bet.answered + '</span>' +
      '</div>'
    );
  }

  function toggleControl(action, label, checked) {
    return (
      '<label class="setting-toggle">' +
      '<input type="checkbox" data-action="' + action + '"' + (checked ? ' checked' : '') + ' />' +
      '<span>' + label + '</span>' +
      '</label>'
    );
  }

  function modeToggle() {
    if (current && current.mode === MODE.BET) {
      return toggleControl('brook', 'Brook in the hand', brookInHand);
    }
    return toggleControl('will', 'Will is on his phone', willOnPhone);
  }

  function topBar() {
    return (
      '<header class="top-bar">' +
      '<div><h1>Odds</h1>' + statsLine() + '</div>' +
      '<div class="top-bar-controls">' +
      modeToggle() +
      '<div class="mode-buttons" aria-label="Mode">' +
      modeButton('Odds', MODE.ODDS) +
      modeButton('Bet', MODE.BET) +
      '</div>' +
      '</div>' +
      '</header>'
    );
  }

  function render() {
    root.innerHTML =
      topBar() +
      '<section class="trainer-layout" aria-label="Poker odds trainer">' +
      promptPanel() +
      answerPanel() +
      '</section>';
  }

  // ---------- controller ----------

  function setScenario(next) {
    current = next;
    answered = null;
    showWinningCards = false;
    render();
  }

  function handleAnswer(rawValue) {
    if (answered || !current) {
      return;
    }

    let selected;
    let correct;
    if (current.mode === MODE.ODDS) {
      selected = Number(rawValue);
      correct = selected === current.correctPercent;
    } else {
      selected = rawValue;
      correct = selected === current.correctAction;
    }

    answered = { selected, correct };
    profile = profileStore.record(profile, {
      mode: current.mode,
      key: current.paramKey,
      selected: String(selected),
      correct,
    });
    render();
  }

  function hashFor(s) {
    return '#/' + s.mode + '?' + scenario.toQueryString(s);
  }

  function loadNew(mode) {
    const next = hashFor(scenario.generate(mode, buildOptions()));
    if (location.hash === next) {
      renderFromHash();
    } else {
      location.hash = next;
    }
  }

  function renderFromHash() {
    const parsed = scenario.parseHash(location.hash || '#/odds');
    if (parsed.params) {
      const built = scenario.build(parsed.params, buildOptions());
      if (!built.error) {
        setScenario(built);
        return;
      }
    }
    const fresh = scenario.generate(parsed.mode, buildOptions());
    history.replaceState(null, '', hashFor(fresh));
    setScenario(fresh);
  }

  function setBrook(value) {
    brookInHand = value;
    profile.settings.brookInHand = value;
    profileStore.save(profile);
    if (current && !answered) {
      current = scenario.build(paramsOf(current), buildOptions());
    }
    render();
  }

  function setWill(value) {
    willOnPhone = value;
    profile.settings.willOnPhone = value;
    profileStore.save(profile);
    if (current && !answered) {
      current = scenario.build(paramsOf(current), buildOptions());
    }
    render();
  }

  root.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) {
      return;
    }
    const action = trigger.dataset.action;
    if (action === 'mode') {
      loadNew(trigger.dataset.mode);
    } else if (action === 'answer') {
      handleAnswer(trigger.dataset.answer);
    } else if (action === 'toggle-winning') {
      showWinningCards = !showWinningCards;
      render();
    } else if (action === 'next') {
      loadNew(current.mode);
    }
  });

  root.addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-action]');
    if (!toggle) {
      return;
    }
    if (toggle.dataset.action === 'brook') {
      setBrook(toggle.checked);
    } else if (toggle.dataset.action === 'will') {
      setWill(toggle.checked);
    }
  });

  window.addEventListener('hashchange', renderFromHash);

  renderFromHash();
})();
