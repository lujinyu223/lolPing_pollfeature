import type { TextAnswer, TextBoxText } from '../../shared/ipc';
import { MAX_TEXT } from '../../shared/roomProtocol';
import { strings } from '../../shared/i18n';
import { normalizePoll } from '../../shared/pollTally';

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
