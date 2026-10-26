// Invented people and chats for the website's screenshots (#384). The screenshot
// run picks a persona per account through localStorage, as each account has its own.
const PERSONAS = {
  personal: {
    avatar: '/media/showcase/personal.png',
    chats: [
      {
        name: 'Lisbon trip',
        color: '#e07a5f',
        last: 'Inês: Booked the tram tour for Saturday!',
        time: '09:41',
        unread: 4,
        group: true,
      },
      { name: 'Mum', color: '#81b29a', last: 'Call me when you land ❤️', time: '09:12', unread: 1 },
      { name: 'Priya Shah', color: '#6d597a', last: 'Haha, that photo is perfect', time: '08:57' },
      {
        name: 'Book club',
        color: '#3d5a80',
        last: 'Next pick: something short, please',
        time: 'Yesterday',
        group: true,
      },
      { name: 'Tomás Rivera', color: '#f2a541', last: 'Football on Thursday?', time: 'Yesterday' },
      {
        name: 'Climbing crew',
        color: '#2a9d8f',
        last: 'Wall opens at 7',
        time: 'Tuesday',
        group: true,
      },
      { name: 'Aiko Tanaka', color: '#c05299', last: 'Thanks for the recipe!', time: 'Monday' },
      {
        name: 'Neighbours',
        color: '#7a8b99',
        last: 'Parcel for flat 3B at mine',
        time: 'Sunday',
        group: true,
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
        color: '#3d5a80',
        last: 'Marta: New mockups are in the folder',
        time: '10:05',
        unread: 2,
        group: true,
      },
      {
        name: 'Release crew',
        color: '#e76f51',
        last: 'Ship it after the smoke tests ✅',
        time: '09:58',
        unread: 1,
        group: true,
      },
      {
        name: 'Marta Kowalski',
        color: '#6d597a',
        last: 'Can we move the review to 3?',
        time: '09:20',
      },
      {
        name: 'Northwind support',
        color: '#2a9d8f',
        last: 'Ticket closed, thanks!',
        time: 'Yesterday',
      },
      {
        name: 'Daniel Mensah',
        color: '#f2a541',
        last: 'Sent you the contract draft',
        time: 'Yesterday',
      },
      {
        name: 'Office',
        color: '#7a8b99',
        last: 'Pizza Friday is back',
        time: 'Monday',
        group: true,
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

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');

function face(element, chat) {
  element.className = 'face';
  element.style.background = chat.color;
  element.textContent = initials(chat.name);
}

const list = document.getElementById('pane-side');
for (const [index, chat] of persona.chats.entries()) {
  const row = document.createElement('div');
  row.className = `row${index === 0 ? ' open' : ''}${chat.unread ? ' unread' : ''}`;
  row.setAttribute('role', 'row');
  const avatar = document.createElement('span');
  face(avatar, chat);
  const text = document.createElement('div');
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

const messages = document.getElementById('messages');
for (const [index, message] of persona.messages.entries()) {
  if (message.day) {
    const day = document.createElement('div');
    day.className = 'day';
    day.textContent = message.day;
    messages.append(day);
    continue;
  }
  const bubble = document.createElement('div');
  bubble.className = `bubble${message.mine ? ' mine' : ''}`;
  bubble.dataset.id = `${message.mine ? 'true' : 'false'}_showcase-${String(index)}@g.us`;
  const body = document.createElement('span');
  body.dataset.prePlainText = `[${message.time}] ${message.mine ? 'You' : message.who}: `;
  if (!message.mine) {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = message.who;
    bubble.append(who);
  }
  body.append(message.text);
  const time = document.createElement('time');
  time.textContent = message.time;
  bubble.append(body, time);
  messages.append(bubble);
}

// WhatsApp's title counts unread chats, not messages.
const unread = persona.chats.filter((chat) => chat.unread).length;
document.title = unread > 0 ? `(${String(unread)}) WhatsApp` : 'WhatsApp';
