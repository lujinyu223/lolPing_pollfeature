import { strings } from '../../shared/i18n';
import type { PanelAction, PanelState } from '../../shared/ipc';
import { el } from './vote';

export function renderPoll(root: HTMLElement, state: PanelState, act: (action: PanelAction) => void): void {
  const poll = state.poll;
  if (!poll) {
    root.replaceChildren();
    delete root.dataset.poll;
    return;
  }
  if (state.pollMinimized) {
    const dock = el('section', 'poll-minimized');
    const question = el('span', 'poll-minimized-question', poll.question);
    question.title = poll.question;
    const restore = el('button', 'poll-restore', strings(state.lang).pollRestore);
    restore.type = 'button';
    restore.addEventListener('click', () => act({ t: 'pollRestore', id: poll.id }));
    dock.append(question, restore);
    root.replaceChildren(dock);
    return;
  }
  const selected = root.dataset.poll === poll.id
    ? [...root.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => Number(input.value)) : [];
  root.dataset.poll = poll.id;
  const t = strings(state.lang);
  const me = state.room.members.find((member) => member.self)?.peer;
  const mine = me === undefined ? undefined : poll.ballots[me];
  const canVote = me !== undefined && poll.voters.includes(me) && !mine && !poll.over;
  const options = poll.mode === 'yesno' ? [t.voteYes, t.voteNo] : poll.options;
  const section = el('section', 'poll-widget lol-frame');
  const starter = state.room.members.find((member) => member.peer === poll.starter)?.name ?? '?';
  const header = el('header', 'poll-header');
  const heading = el('h1', '', poll.question);
  const minimize = el('button', 'poll-minimize', '−');
  minimize.type = 'button';
  minimize.title = t.pollMinimize;
  minimize.setAttribute('aria-label', t.pollMinimize);
  minimize.addEventListener('click', () => act({ t: 'pollMinimize', id: poll.id }));
  header.append(heading, minimize);
  section.append(header, el('p', 'poll-meta', t.voteStartedBy(starter)));
  const form = el('form', 'poll-choices');
  for (const [index, option] of options.entries()) {
    const label = el('label', 'poll-choice');
    const input = el('input', '');
    input.type = poll.mode === 'multiple' ? 'checkbox' : 'radio';
    input.name = 'choice';
    input.value = String(index);
    input.checked = (mine ?? selected).includes(index);
    input.disabled = !canVote;
    label.append(input, el('span', '', option), el('strong', '', String(poll.counts[index])));
    form.append(label);
  }
  const submit = el('button', 'decline', t.pollSubmit);
  submit.type = 'submit';
  submit.disabled = !canVote || !form.querySelector('input:checked');
  form.addEventListener('change', () => { submit.disabled = !canVote || !form.querySelector('input:checked'); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const choices = [...form.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => Number(input.value));
    if (!canVote || !choices.length || submit.disabled) return;
    submit.disabled = true;
    act({ t: 'pollBallot', id: poll.id, choices });
  });
  form.append(submit);
  const remaining = Math.max(0, Math.ceil((poll.endsAt - Date.now()) / 1000));
  section.append(form, el('p', 'poll-meta', t.pollProgress(Object.keys(poll.ballots).length, poll.voters.length)),
    el('p', 'poll-meta', poll.over ? t.voteEnded : mine ? t.pollVoted : t.pollRemaining(remaining)));
  root.replaceChildren(section);
}