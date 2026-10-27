import type { TextAnswer, TextBoxText } from '../../shared/ipc';
import { MAX_TEXT } from '../../shared/roomProtocol';
import { strings } from '../../shared/i18n';
import { normalizePoll } from '../../shared/pollTally';
import { MAX_SPIN_CHOICES, MAX_SPIN_LABEL, normalizeSpinWheel, type SpinChoice } from '../../shared/spinWheel';

const input = document.getElementById('message') as HTMLInputElement;
const count = document.getElementById('count') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
/** The counter shows in the last 20 code points. */
const COUNT_FROM = MAX_TEXT - 20;
let words: TextBoxText | null = null;

const showHint = (message: string, warn: boolean): void => {
  hint.textContent = message;
  hint.classList.toggle('warn', warn);
};

/** A code point is one letter, one Chinese character or one emoji, however many UTF-16 units it takes. */
function clamp(): void {
  const points = [...input.value];
  if (points.length > MAX_TEXT) input.value = points.slice(0, MAX_TEXT).join('');
  const used = Math.min(points.length, MAX_TEXT);
  count.hidden = used < COUNT_FROM;
  count.textContent = `${used}/${MAX_TEXT}`;
  count.classList.toggle('full', used >= MAX_TEXT);
}

/** A held Enter repeats faster than the answer comes back: one submit at a time, or the text would be sent twice. */
let sending = false;

async function send(): Promise<void> {
  if (sending) return;
  sending = true;
  let answer: TextAnswer;
  try {
    answer = await window.textApi.submit(input.value);
  } catch (error) {
    sending = false;
    throw error;
  }
  // 'sent' closes the box: staying locked keeps a held Enter from sending the text again before the window is gone.
  if (answer === 'sent') return;
  sending = false;
  if (answer === 'poll') showPollForm();
  else if (answer === 'spinwheel') showSpinWheelForm();
  else if (answer === 'spin') showSpinView();
  else if (answer === 'invalidSpinWheel') showHint(strings(words?.lang ?? 'en').spinWheelInvalid, true);
  else if (answer === 'unknown') showHint(words?.unknown ?? '', true);
  else if (answer === 'votesOff') showHint(words?.votesOff ?? '', true);
}

// While an input method is composing, the box holds a draft: cutting it would break the composition, and Enter confirms it.
input.addEventListener('input', (event) => {
  if (!(event as InputEvent).isComposing) clamp();
  if (words) showHint(words.hint, false);
});
input.addEventListener('compositionend', clamp);
input.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    void send();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    window.textApi.cancel();
  } else if (event.key === 'Tab') {
    event.preventDefault(); // focus leaving the box would leave Enter and Esc with nothing to hear them
  }
});

void window.textApi.strings().then((t) => {
  if (!t) return;
  words = t;
  input.placeholder = t.placeholder;
  showHint(t.hint, false);
});
requestAnimationFrame(() => input.focus());

function showPollForm(): void {
  const t = strings(words?.lang ?? 'en');
  const form = document.createElement('form');
  form.className = 'poll-form';
  const title = document.createElement('h1');
  title.textContent = t.pollTitle;
  const field = (text: string, control: HTMLElement): HTMLLabelElement => {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = text;
    label.append(caption, control);
    return label;
  };
  const mode = document.createElement('select');
  for (const [value, text] of [['single', t.pollSingle], ['multiple', t.pollMultiple], ['yesno', t.pollYesNo]]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    mode.append(option);
  }
  const question = document.createElement('input');
  question.type = 'text';
  question.required = true;
  question.addEventListener('input', (event) => {
    if (!(event as InputEvent).isComposing) question.value = [...question.value].slice(0, 60).join('');
  });
  question.addEventListener('compositionend', () => { question.value = [...question.value].slice(0, 60).join(''); });
  const options = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = t.pollOptions;
  options.append(legend);
  const choices = Array.from({ length: 6 }, (_, index) => {
    const choice = document.createElement('input');
    choice.type = 'text';
    choice.setAttribute('aria-label', `${t.pollOptions} ${index + 1}`);
    choice.required = index < 2;
    choice.addEventListener('input', (event) => {
      if (!(event as InputEvent).isComposing) choice.value = [...choice.value].slice(0, 24).join('');
    });
    choice.addEventListener('compositionend', () => { choice.value = [...choice.value].slice(0, 24).join(''); });
    options.append(choice);
    return choice;
  });
  mode.addEventListener('change', () => {
    options.hidden = mode.value === 'yesno';
    for (const choice of choices) choice.disabled = options.hidden;
  });
  const status = document.createElement('p');
  status.className = 'poll-error';
  status.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'poll-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t.pollCancel;
  cancel.addEventListener('click', () => window.textApi.cancel());
  const create = document.createElement('button');
  create.type = 'submit';
  create.textContent = t.pollCreate;
  actions.append(cancel, create);
  form.append(title, field(t.pollMode, mode), field(t.pollQuestion, question), options, status, actions);
  form.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') window.textApi.cancel();
    if (event.key === 'Enter' && event.target !== create) event.preventDefault();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const poll = normalizePoll({ mode: mode.value, question: question.value, options: choices.map((choice) => choice.value).filter((value) => value.trim()) });
    if (!poll) {
      status.textContent = t.pollInvalid;
      return;
    }
    if (create.disabled) return;
    create.disabled = true;
    void window.textApi.startPoll(poll).then((answer) => {
      if (answer === 'sent') return;
      create.disabled = false;
      status.textContent = answer === 'votesOff' ? t.votesOff : answer === 'busy' ? t.voteBusy : t.pollInvalid;
    }).catch(() => {
      create.disabled = false;
      status.textContent = t.pollInvalid;
    });
  });
  document.querySelector('main')?.replaceChildren(form);
  question.focus();
}

const wheelColors = ['#d85c48', '#3b9c9b', '#e3b341', '#5578a8', '#71a45b', '#b5688c', '#d3813b', '#6c70ad'];

function drawWheel(canvas: HTMLCanvasElement, choices: readonly SpinChoice[]): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const center = canvas.width / 2;
  const radius = center - 5;
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  let start = -Math.PI / 2;
  for (const [index, choice] of choices.entries()) {
    const end = start + (choice.weight / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end);
    context.closePath();
    context.fillStyle = wheelColors[index % wheelColors.length];
    context.fill();
    context.strokeStyle = '#10181b';
    context.lineWidth = 3;
    context.stroke();
    if (end - start > 0.18) {
      const middle = (start + end) / 2;
      context.save();
      context.translate(center + Math.cos(middle) * radius * 0.58, center + Math.sin(middle) * radius * 0.58);
      context.rotate(middle + Math.PI / 2);
      context.fillStyle = '#fff4d3';
      context.font = '600 15px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const label = [...choice.label].slice(0, 14).join('');
      context.fillText(label, 0, 0, radius * 0.55);
      context.restore();
    }
    start = end;
  }
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = '#e3c677';
  context.lineWidth = 5;
  context.stroke();
}

function makeWheelCanvas(choices: readonly SpinChoice[], className = 'spin-wheel'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.width = 400;
  canvas.height = 400;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', choices.map((choice) => choice.label).join(', '));
  drawWheel(canvas, choices);
  return canvas;
}

function showSpinWheelForm(): void {
  const t = strings(words?.lang ?? 'en');
  const form = document.createElement('form');
  form.className = 'spinwheel-form';
  const title = document.createElement('h1');
  title.textContent = t.spinWheelTitle;
  const description = document.createElement('p');
  description.className = 'spinwheel-desc';
  description.textContent = t.spinWheelDesc;
  const preview = document.createElement('div');
  preview.className = 'spinwheel-preview';
  let choices = normalizeSpinWheel(words?.spinChoices);
  if (choices.length === 0) choices = [{ label: '', weight: 1 }, { label: '', weight: 1 }];
  let previewWheel = makeWheelCanvas(choices, 'spin-wheel spin-wheel-small');
  preview.append(previewWheel);
  const rows = document.createElement('div');
  rows.className = 'spin-choice-list';
  const error = document.createElement('p');
  error.className = 'poll-error';
  error.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'poll-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t.pollCancel;
  cancel.addEventListener('click', () => window.textApi.cancel());
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = t.spinWheelAdd;
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = t.spinWheelSave;
  actions.append(cancel, add, save);

  const renderRows = (): void => {
    rows.replaceChildren();
    choices.forEach((choice, index) => {
      const row = document.createElement('div');
      row.className = 'spin-choice-row';
      const label = document.createElement('input');
      label.type = 'text';
      label.maxLength = MAX_SPIN_LABEL * 2;
      label.value = choice.label;
      label.placeholder = `${t.spinWheelChoice} ${index + 1}`;
      label.setAttribute('aria-label', `${t.spinWheelChoice} ${index + 1}`);
      const weight = document.createElement('input');
      weight.type = 'number';
      weight.min = '1';
      weight.max = '1000';
      weight.step = '1';
      weight.value = String(choice.weight);
      weight.setAttribute('aria-label', `${t.spinWheelWeight} ${index + 1}`);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'spin-remove';
      remove.textContent = '×';
      remove.title = t.spinWheelRemove;
      remove.setAttribute('aria-label', t.spinWheelRemove);
      const updateLabel = (): void => {
        choice.label = [...label.value].slice(0, MAX_SPIN_LABEL).join('');
        if (label.value !== choice.label) label.value = choice.label;
        updatePreview();
      };
      label.addEventListener('input', (event) => {
        if (!(event as InputEvent).isComposing) updateLabel();
      });
      label.addEventListener('compositionend', updateLabel);
      weight.addEventListener('input', () => {
        choice.weight = Math.min(1000, Math.max(1, Math.round(Number(weight.value) || 1)));
        updatePreview();
      });
      remove.disabled = choices.length <= 2;
      remove.addEventListener('click', () => {
        if (choices.length <= 2) return;
        choices = choices.filter((_, itemIndex) => itemIndex !== index);
        renderRows();
        updatePreview();
      });
      row.append(label, weight, remove);
      rows.append(row);
    });
    add.disabled = choices.length >= MAX_SPIN_CHOICES;
  };
  const updatePreview = (): void => {
    const valid = normalizeSpinWheel(choices);
    const updated = makeWheelCanvas(valid.length ? valid : [{ label: '?', weight: 1 }], 'spin-wheel spin-wheel-small');
    previewWheel.replaceWith(updated);
    previewWheel = updated;
  };
  add.addEventListener('click', () => {
    if (choices.length >= MAX_SPIN_CHOICES) return;
    choices = [...choices, { label: '', weight: 1 }];
    renderRows();
    rows.lastElementChild?.querySelector('input')?.focus();
    updatePreview();
  });
  form.append(title, description, preview, rows, error, actions);
  form.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') window.textApi.cancel();
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'number') event.preventDefault();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const normalized = normalizeSpinWheel(choices);
    if (normalized.length < 2) {
      error.textContent = t.spinWheelInvalid;
      return;
    }
    save.disabled = true;
    void window.textApi.saveSpinWheel(normalized).then((answer) => {
      if (answer !== 'sent') {
        save.disabled = false;
        error.textContent = t.spinWheelInvalid;
      }
    }).catch(() => {
      save.disabled = false;
      error.textContent = t.spinWheelInvalid;
    });
  });
  renderRows();
  document.querySelector('main')?.replaceChildren(form);
  rows.querySelector('input')?.focus();
}

function showSpinView(): void {
  const t = strings(words?.lang ?? 'en');
  const choices = normalizeSpinWheel(words?.spinChoices);
  const main = document.querySelector('main');
  if (!main || choices.length < 2) return;
  const view = document.createElement('section');
  view.className = 'spin-view';
  const title = document.createElement('h1');
  title.textContent = t.spinWheelTitle;
  const pointer = document.createElement('span');
  pointer.className = 'spin-pointer';
  const wheel = makeWheelCanvas(choices);
  const result = document.createElement('p');
  result.className = 'spin-result';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'spin-start';
  button.textContent = t.spinWheelSpin;
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    void window.textApi.startSpin().then((selection) => {
      if (!selection || !choices[selection.index]) {
        result.textContent = t.spinWheelEmpty;
        button.disabled = false;
        return;
      }
      const before = choices.slice(0, selection.index).reduce((sum, choice) => sum + choice.weight, 0);
      const middle = ((before + choices[selection.index].weight / 2) / choices.reduce((sum, choice) => sum + choice.weight, 0)) * 360;
      const animation = wheel.animate(
        [{ transform: 'rotate(0deg)' }, { transform: `rotate(${360 * 6 + 360 - middle}deg)` }],
        { duration: 4200, easing: 'cubic-bezier(.12,.72,.08,1)', fill: 'forwards' },
      );
      result.textContent = selection.label;
      void animation.finished.then(() => window.textApi.finishSpin()).catch(() => {
        button.disabled = false;
      });
    }).catch(() => {
      button.disabled = false;
      result.textContent = t.spinWheelEmpty;
    });
  });
  view.append(title, pointer, wheel, result, button);
  main.replaceChildren(view);
}
