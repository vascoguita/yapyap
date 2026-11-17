// Invented people and chats for the README's and website's pictures (#384, #663). The
// screenshot run picks a persona per account through localStorage, as each account has
// its own. People get an illustrated face, groups an emoji, as many do in WhatsApp.

const FACES = {
  ines: {
    bg: ['#f6a87c', '#e5677a'],
    skin: '#8d5a3b',
    hair: '#2b1a12',
    style: 'long',
    shirt: '#2a9d8f',
  },
  mum: {
    bg: ['#9ad1b4', '#5e9e8f'],
    skin: '#f1c7a5',
    hair: '#6b4a32',
    style: 'bob',
    shirt: '#c05299',
  },
  priya: {
    bg: ['#c7a8e8', '#7d5ab8'],
    skin: '#b77b55',
    hair: '#1d1410',
    style: 'long',
    shirt: '#f2a541',
  },
  tomas: {
    bg: ['#f9d27a', '#e99a3c'],
    skin: '#e9b48f',
    hair: '#3b2a20',
    style: 'short',
    shirt: '#3d5a80',
  },
  aiko: {
    bg: ['#8ec5ff', '#4f7fd8'],
    skin: '#f3d2b3',
    hair: '#151515',
    style: 'bob',
    shirt: '#e76f51',
  },
  marta: {
    bg: ['#ffb4a2', '#e5677a'],
    skin: '#f1c7a5',
    hair: '#a0522d',
    style: 'long',
    shirt: '#264653',
  },
  daniel: {
    bg: ['#a8dadc', '#457b9d'],
    skin: '#6b4226',
    hair: '#111111',
    style: 'short',
    shirt: '#e9c46a',
  },
};

const SENDERS = {
  Priya: '#e5677a',
  Tomás: '#f2a541',
  Inês: '#53bdeb',
  Lena: '#c7a8e8',
  Marta: '#21c063',
};

const PERSONAS = {
  personal: {
    avatar: '/media/showcase/personal.png',
    chats: [
      {
        name: 'Lisbon trip',
        emoji: '✈️',
        tint: '#5b7a99',
        last: 'Inês: Booked the tram tour for Saturday!',
        time: '09:41',
      },
      { name: 'Mum', face: 'mum', last: 'Call me when you land ❤️', time: '09:12', unread: 1 },
      { name: 'Priya Shah', face: 'priya', last: 'Haha, that photo is perfect', time: '08:57' },
      {
        name: 'Book club',
        emoji: '📚',
        tint: '#e9a23b',
        last: 'Next pick: something short, please',
        time: 'Yesterday',
        unread: 3,
      },
      { name: 'Tomás Rivera', face: 'tomas', last: 'Football on Thursday?', time: 'Yesterday' },
      {
        name: 'Climbing crew',
        emoji: '🧗',
        tint: '#2f6f9f',
        last: 'Aiko: Wall opens at 7',
        time: 'Tuesday',
      },
      { name: 'Aiko Tanaka', face: 'aiko', last: 'Thanks for the recipe!', time: 'Monday' },
      {
        name: 'Neighbours',
        emoji: '🏡',
        tint: '#6f8f5f',
        last: 'Parcel for flat 3B at mine',
        time: 'Sunday',
      },
    ],
    title: 'Lisbon trip',
    status: 'Inês, Priya, Tomás, You',
    messages: [
      { day: 'Today' },
      {
        who: 'Priya',
        text: 'Okay, flights are sorted. Who is still on the fence about the tram tour?',
        time: '09:30',
      },
      {
        who: 'Tomás',
        text: 'Not me, I am in. As long as we get pastéis de nata after 😄',
        time: '09:32',
      },
      {
        mine: true,
        text: 'Count me in too. I can book the restaurant for Friday night.',
        time: '09:35',
      },
      {
        who: 'Inês',
        text: 'Booked the tram tour for Saturday! Meeting point is Praça Martim Moniz at 10.',
        time: '09:41',
      },
    ],
  },
  work: {
    avatar: '/media/showcase/work.png',
    chats: [
      {
        name: 'Design team',
        emoji: '🎨',
        tint: '#7d5ab8',
        last: 'Marta: New mockups are in the folder',
        time: '10:05',
      },
      {
        name: 'Release crew',
        emoji: '🚀',
        tint: '#e76f51',
        last: 'Ship it after the smoke tests ✅',
        time: '09:58',
        unread: 1,
      },
      {
        name: 'Marta Kowalski',
        face: 'marta',
        last: 'Can we move the review to 3?',
        time: '09:20',
      },
      {
        name: 'Northwind support',
        emoji: '🛟',
        tint: '#2a9d8f',
        last: 'Ticket closed, thanks!',
        time: 'Yesterday',
      },
      {
        name: 'Daniel Mensah',
        face: 'daniel',
        last: 'Sent you the contract draft',
        time: 'Yesterday',
        unread: 2,
      },
      {
        name: 'Office',
        emoji: '🍕',
        tint: '#7a8b99',
        last: 'Pizza Friday is back',
        time: 'Monday',
      },
    ],
    title: 'Design team',
    status: 'Marta, Daniel, Lena, You',
    messages: [
      { day: 'Today' },
      {
        who: 'Lena',
        text: 'Morning! The onboarding screens feel much lighter now.',
        time: '09:48',
      },
      {
        mine: true,
        text: 'Agreed. Can we keep the empty state illustration from v2?',
        time: '09:52',
      },
      { who: 'Marta', text: 'Yes, already in. New mockups are in the folder.', time: '10:05' },
    ],
  },
};

const persona =
  PERSONAS[localStorage.getItem('showcase-persona') ?? 'personal'] ?? PERSONAS.personal;

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** A flat illustrated face, in the style of the accounts' own pictures. */
function faceSvg({ bg, skin, hair, style, shirt }) {
  const hairShape = {
    short: '<path d="M30,44c0,-14,9,-22,20,-22s20,8,20,22c-6,-6,-13,-8,-20,-8s-14,2,-20,8z"/>',
    bob: '<path d="M27,58c-2,-22,8,-34,23,-34s25,12,23,34c-3,-10,-6,-18,-6,-18H33s-3,8,-6,18z"/>',
    long: '<path d="M26,74c-4,-30,4,-50,24,-50s28,20,24,50c-4,-16,-6,-30,-6,-30H32s-2,14,-6,30z"/>',
  }[style];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/>
    </linearGradient></defs>
    <rect width="100" height="100" fill="url(#g)"/>
    <path d="M18,100c2,-16,15,-26,32,-26s30,10,32,26z" fill="${shirt}"/>
    <rect x="43" y="60" width="14" height="16" fill="${skin}"/>
    <g fill="${hair}">${hairShape}</g>
    <ellipse cx="50" cy="47" rx="17" ry="19" fill="${skin}"/>
    <g fill="${hair}"><path d="M33,42c2,-11,9,-16,17,-16s15,5,17,16c-5,-5,-11,-7,-17,-7s-12,2,-17,7z"/></g>
  </svg>`;
}

function face(element, chat) {
  element.className = 'face';
  if (chat.face) {
    element.style.backgroundImage = svgUrl(faceSvg(FACES[chat.face]));
    element.textContent = '';
  } else {
    element.style.background = chat.tint;
    element.textContent = chat.emoji;
  }
}

const list = document.getElementById('pane-side');
for (const [index, chat] of persona.chats.entries()) {
  const row = document.createElement('div');
  row.className = `row${index === 0 ? ' open' : ''}${chat.unread ? ' unread' : ''}`;
  row.setAttribute('role', 'row');
  const avatar = document.createElement('span');
  face(avatar, chat);
  const text = document.createElement('div');
  text.style.minWidth = '0';
  const name = document.createElement('strong');
  name.textContent = chat.name;
  const last = document.createElement('span');
  last.className = 'last';
  last.textContent = chat.last;
  text.append(name, last);
  const meta = document.createElement('div');
  meta.className = 'meta';
  const time = document.createElement('time');
  time.textContent = chat.time;
  meta.append(time);
  if (chat.unread) {
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(chat.unread);
    meta.append(count);
  }
  row.append(avatar, text, meta);
  list.append(row);
}

face(document.getElementById('chat-face'), persona.chats[0]);
document.getElementById('chat-name').textContent = persona.title;
document.getElementById('chat-status').textContent = persona.status;
document.getElementById('own-avatar').src = persona.avatar;

/** A wallpaper of small line doodles, dense like WhatsApp's, in the theme's doodle ink. */
function doodles() {
  const ink = window.getComputedStyle(document.documentElement).getPropertyValue('--doodle').trim();
  const shapes = [
    '<circle cx="0" cy="0" r="7"/><path d="M0,-3v3h3"/>',
    '<path d="M-8,4l8,-11,8,11z"/>',
    '<path d="M0,7s-8,-5,-8,-10a4,4,0,0,1,8,-2,4,4,0,0,1,8,2c0,5,-8,10,-8,10z"/>',
    '<path d="M-8,-6h16v12h-16zM-8,-6l8,6,8,-6"/>',
    '<path d="M0,-8l2.5,5.5h6l-5,3.5,2,6.5,-5.5,-4,-5.5,4,2,-6.5,-5,-3.5h6z"/>',
    '<path d="M-6,-5h12v7a6,6,0,0,1,-12,0zM6,-2h2a2.5,2.5,0,0,1,0,5h-2"/>',
    '<path d="M-8,3a4,4,0,0,1,2,-7a5,5,0,0,1,9,-1a4,4,0,0,1,4,8z"/>',
    '<path d="M-3,6v-12l9,-2v12M-3,6a2.5,2.5,0,1,1,-5,0a2.5,2.5,0,0,1,5,0zM6,4a2.5,2.5,0,1,1,-5,0a2.5,2.5,0,0,1,5,0z"/>',
    '<path d="M-8,-4h4l2,-3h4l2,3h4v10h-16z"/><circle cx="0" cy="1" r="3"/>',
    '<path d="M-7,7c0,-9,5,-14,14,-14c0,9,-5,14,-14,14zM-7,7l9,-9"/>',
    '<path d="M0,-8a5,6,0,0,1,0,12a5,6,0,0,1,0,-12zM0,4l-1,4h2"/>',
    '<circle cx="0" cy="0" r="4"/><path d="M0,-9v2M0,7v2M-9,0h2M7,0h2M-6,-6l1.5,1.5M4.5,4.5l1.5,1.5M-6,6l1.5,-1.5M4.5,-4.5l1.5,-1.5"/>',
    '<path d="M-8,-6h16v9h-9l-4,4v-4h-3z"/>',
    '<path d="M-8,0l16,-7,-5,15,-3,-6z"/>',
    '<path d="M-7,-2h14v9h-14zM-8,-5h16v3h-16zM0,-5v12M0,-5c-2,-4,-6,-3,-4,0M0,-5c2,-4,6,-3,4,0"/>',
  ];
  let art = '';
  let seed = 7;
  const next = () => {
    seed = (seed * 9301 + 49_297) % 233_280;
    return seed / 233_280;
  };
  for (let y = 14; y < 300; y += 30) {
    for (let x = 14; x < 300; x += 32) {
      const shape = shapes[Math.floor(next() * shapes.length)];
      const turn = Math.floor(next() * 50) - 25;
      const dx = x + (next() - 0.5) * 12;
      const dy = y + (next() - 0.5) * 10;
      art += `<g transform="translate(${dx.toFixed(1)},${dy.toFixed(1)}) rotate(${String(turn)}) scale(0.8)">${shape}</g>`;
    }
  }
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${art}</svg>`,
  );
}
document.getElementById('messages').style.setProperty('--doodles', doodles());

const messages = document.getElementById('messages');
let sent = 0;

const TICKS = '<svg class="ticks" viewBox="0 0 16 11"><path d="M1,6l3,3,6,-7M6,8l1,1,6,-7"/></svg>';

/** Adds a message bubble as WhatsApp draws one, keyed so the adapter reads its sender. */
function addMessage(message) {
  const bubble = document.createElement('div');
  bubble.className = `bubble${message.mine ? ' mine' : ''}`;
  bubble.dataset.id = `${message.mine ? 'true' : 'false'}_showcase-${String(sent)}@g.us`;
  sent += 1;
  const body = document.createElement('span');
  body.dataset.prePlainText = `[${message.time}] ${message.mine ? 'You' : message.who}: `;
  if (!message.mine) {
    const who = document.createElement('span');
    who.className = 'who';
    who.style.color = SENDERS[message.who] ?? '#21c063';
    who.textContent = message.who;
    bubble.append(who);
  }
  body.append(message.text);
  const time = document.createElement('time');
  time.textContent = message.time;
  if (message.mine) {
    time.insertAdjacentHTML('beforeend', TICKS);
  }
  bubble.append(body, time);
  messages.append(bubble);
  messages.scrollTop = messages.scrollHeight;
}

for (const message of persona.messages) {
  if (message.day) {
    const day = document.createElement('div');
    day.className = 'day';
    day.textContent = message.day;
    messages.append(day);
    continue;
  }
  addMessage(message);
}

/** The open chat's row in the list shows its newest message, as WhatsApp's does. */
function preview(text, time) {
  const row = list.querySelector('.row.open');
  row.querySelector('.last').textContent = text;
  row.querySelector('time').textContent = time;
}

// Moving clock for the messages a recording sends and receives.
let minute = 41;
const now = () => {
  minute += 1;
  return `09:${String(minute).padStart(2, '0')}`;
};

const composer = document.querySelector('[data-testid="composer"]');
const voiceOrSend = document.getElementById('voice-or-send');

/** Sends what the message box holds, as WhatsApp's Enter and Send do. */
function send() {
  const text = composer.textContent.trim();
  if (text === '') {
    return;
  }
  const time = now();
  addMessage({ mine: true, text, time });
  preview(`You: ${text}`, time);
  composer.textContent = '';
  composer.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
}

// The microphone becomes Send while the box holds text, as in WhatsApp.
composer.addEventListener('input', () => {
  const drafting = composer.textContent.trim() !== '';
  voiceOrSend.classList.toggle('sending', drafting);
  voiceOrSend.setAttribute('aria-label', drafting ? 'Send' : 'Voice message');
});
voiceOrSend.addEventListener('click', send);
composer.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    send();
  }
});

/** Lets a recording have someone else in the chat write. */
window.showcaseReceive = (who, text) => {
  const time = now();
  addMessage({ who, text, time });
  preview(`${who}: ${text}`, time);
};

// WhatsApp's title counts unread chats, not messages.
const unread = persona.chats.filter((chat) => chat.unread).length;
document.title = unread > 0 ? `(${String(unread)}) WhatsApp` : 'WhatsApp';
