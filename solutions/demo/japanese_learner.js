'use strict';

// ═══════════════════════════════════════════════════════════════════
//  VOCABULARY POOL  (26 seed words)
// ═══════════════════════════════════════════════════════════════════

const VOCAB = [
  // ── 五段動詞 (Godan / Group 1) ────────────────────────────────
  {
    id: 'v01',
    kanji: '行く',
    furigana: 'いく',
    romaji: 'iku',
    pos: 'verb_1',
    zh: '去',
    en: 'to go',
  },
  {
    id: 'v02',
    kanji: '書く',
    furigana: 'かく',
    romaji: 'kaku',
    pos: 'verb_1',
    zh: '写',
    en: 'to write',
  },
  {
    id: 'v03',
    kanji: '聞く',
    furigana: 'きく',
    romaji: 'kiku',
    pos: 'verb_1',
    zh: '听/问',
    en: 'to listen / ask',
  },
  {
    id: 'v04',
    kanji: '飲む',
    furigana: 'のむ',
    romaji: 'nomu',
    pos: 'verb_1',
    zh: '喝',
    en: 'to drink',
  },
  {
    id: 'v05',
    kanji: '読む',
    furigana: 'よむ',
    romaji: 'yomu',
    pos: 'verb_1',
    zh: '读',
    en: 'to read',
  },
  {
    id: 'v06',
    kanji: '話す',
    furigana: 'はなす',
    romaji: 'hanasu',
    pos: 'verb_1',
    zh: '说话',
    en: 'to speak',
  },
  {
    id: 'v07',
    kanji: '待つ',
    furigana: 'まつ',
    romaji: 'matsu',
    pos: 'verb_1',
    zh: '等待',
    en: 'to wait',
  },
  {
    id: 'v08',
    kanji: '買う',
    furigana: 'かう',
    romaji: 'kau',
    pos: 'verb_1',
    zh: '买',
    en: 'to buy',
  },
  {
    id: 'v09',
    kanji: '帰る',
    furigana: 'かえる',
    romaji: 'kaeru',
    pos: 'verb_1',
    zh: '回家',
    en: 'to return home',
    note: '五段（看似一段）',
  },
  // ── 一段動詞 (Ichidan / Group 2) ─────────────────────────────
  {
    id: 'v10',
    kanji: '食べる',
    furigana: 'たべる',
    romaji: 'taberu',
    pos: 'verb_2',
    zh: '吃',
    en: 'to eat',
  },
  {
    id: 'v11',
    kanji: '見る',
    furigana: 'みる',
    romaji: 'miru',
    pos: 'verb_2',
    zh: '看',
    en: 'to see / watch',
  },
  {
    id: 'v12',
    kanji: '起きる',
    furigana: 'おきる',
    romaji: 'okiru',
    pos: 'verb_2',
    zh: '起床',
    en: 'to wake up',
  },
  {
    id: 'v13',
    kanji: '寝る',
    furigana: 'ねる',
    romaji: 'neru',
    pos: 'verb_2',
    zh: '睡觉',
    en: 'to sleep',
  },
  {
    id: 'v14',
    kanji: '教える',
    furigana: 'おしえる',
    romaji: 'oshieru',
    pos: 'verb_2',
    zh: '教',
    en: 'to teach',
  },
  // ── 不規則動詞 (Irregular / Group 3) ─────────────────────────
  {
    id: 'v15',
    kanji: 'する',
    furigana: 'する',
    romaji: 'suru',
    pos: 'verb_3',
    zh: '做',
    en: 'to do',
  },
  {
    id: 'v16',
    kanji: '来る',
    furigana: 'くる',
    romaji: 'kuru',
    pos: 'verb_3',
    zh: '来',
    en: 'to come',
  },
  // ── い形容詞 (i-adjective) ────────────────────────────────────
  {
    id: 'a01',
    kanji: '美しい',
    furigana: 'うつくしい',
    romaji: 'utsukushii',
    pos: 'adj_i',
    zh: '美丽的',
    en: 'beautiful',
  },
  {
    id: 'a02',
    kanji: '高い',
    furigana: 'たかい',
    romaji: 'takai',
    pos: 'adj_i',
    zh: '贵的/高的',
    en: 'expensive / tall',
  },
  {
    id: 'a03',
    kanji: '大きい',
    furigana: 'おおきい',
    romaji: 'ookii',
    pos: 'adj_i',
    zh: '大的',
    en: 'big / large',
  },
  {
    id: 'a04',
    kanji: '難しい',
    furigana: 'むずかしい',
    romaji: 'muzukashii',
    pos: 'adj_i',
    zh: '难的',
    en: 'difficult',
  },
  {
    id: 'a05',
    kanji: '新しい',
    furigana: 'あたらしい',
    romaji: 'atarashii',
    pos: 'adj_i',
    zh: '新的',
    en: 'new',
  },
  // ── な形容詞 (na-adjective) ───────────────────────────────────
  {
    id: 'a06',
    kanji: '元気',
    furigana: 'げんき',
    romaji: 'genki',
    pos: 'adj_na',
    zh: '精神/健康',
    en: 'healthy / energetic',
  },
  {
    id: 'a07',
    kanji: '静か',
    furigana: 'しずか',
    romaji: 'shizuka',
    pos: 'adj_na',
    zh: '安静的',
    en: 'quiet',
  },
  {
    id: 'a08',
    kanji: '便利',
    furigana: 'べんり',
    romaji: 'benri',
    pos: 'adj_na',
    zh: '方便的',
    en: 'convenient',
  },
  // ── 名詞 (Noun) ───────────────────────────────────────────────
  {
    id: 'n01',
    kanji: '学校',
    furigana: 'がっこう',
    romaji: 'gakkou',
    pos: 'noun',
    zh: '学校',
    en: 'school',
  },
  {
    id: 'n02',
    kanji: '時間',
    furigana: 'じかん',
    romaji: 'jikan',
    pos: 'noun',
    zh: '时间',
    en: 'time',
  },
];

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const POS_LABEL = {
  verb_1: '五段動詞',
  verb_2: '一段動詞',
  verb_3: '不規則動詞',
  adj_i: 'い形容詞',
  adj_na: 'な形容詞',
  noun: '名詞',
};

const POS_COLOR = {
  verb_1: 'bg-blue-100 text-blue-700 border-blue-200',
  verb_2: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  verb_3: 'bg-purple-100 text-purple-700 border-purple-200',
  adj_i: 'bg-amber-100 text-amber-700 border-amber-200',
  adj_na: 'bg-orange-100 text-orange-700 border-orange-200',
  noun: 'bg-green-100 text-green-700 border-green-200',
};

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'verb_1', label: '五段' },
  { key: 'verb_2', label: '一段' },
  { key: 'verb_3', label: '不規則' },
  { key: 'adj_i', label: 'い形' },
  { key: 'adj_na', label: 'な形' },
  { key: 'noun', label: '名詞' },
];

// Godan conjugation table: ending → { i-row, a-row, て, た }
const GODAN = {
  う: { i: 'い', a: 'わ', te: 'って', ta: 'った' },
  く: { i: 'き', a: 'か', te: 'いて', ta: 'いた' },
  ぐ: { i: 'ぎ', a: 'が', te: 'いで', ta: 'いだ' },
  す: { i: 'し', a: 'さ', te: 'して', ta: 'した' },
  つ: { i: 'ち', a: 'た', te: 'って', ta: 'った' },
  ぬ: { i: 'に', a: 'な', te: 'んで', ta: 'んだ' },
  ぶ: { i: 'び', a: 'ば', te: 'んで', ta: 'んだ' },
  む: { i: 'み', a: 'ま', te: 'んで', ta: 'んだ' },
  る: { i: 'り', a: 'ら', te: 'って', ta: 'った' },
};

// ═══════════════════════════════════════════════════════════════════
//  CONJUGATION ENGINE
// ═══════════════════════════════════════════════════════════════════

function row(label, kanji, furi, note) {
  return { label, kanji, furi: furi || kanji, note: note || '' };
}

// Extract verb stem: strip the final hiragana from both kanji and furigana
function godanStem(w) {
  const end = w.furigana[w.furigana.length - 1];
  const ks = w.kanji[w.kanji.length - 1] === end ? w.kanji.slice(0, -1) : w.kanji;
  return { ks, fs: w.furigana.slice(0, -1), end };
}

function conjugateGodan(w) {
  const { ks, fs, end } = godanStem(w);
  const r = GODAN[end];
  if (!r) return [];
  // Special exception: 行く → 行って (NOT 行いて)
  const te = w.kanji === '行く' ? 'って' : r.te;
  const ta = w.kanji === '行く' ? 'った' : r.ta;
  return [
    row('辞書形', w.kanji, w.furigana, '原形'),
    row('ます形', ks + r.i + 'ます', fs + r.i + 'ます', '丁寧・現在肯定'),
    row('ません形', ks + r.i + 'ません', fs + r.i + 'ません', '丁寧・現在否定'),
    row('て形', ks + te, fs + te, '連用・接続'),
    row('た形', ks + ta, fs + ta, '普通・過去肯定'),
    row('ない形', ks + r.a + 'ない', fs + r.a + 'ない', '普通・現在否定'),
    row('なかった形', ks + r.a + 'なかった', fs + r.a + 'なかった', '普通・過去否定'),
  ];
}

function conjugateIchidan(w) {
  const ks = w.kanji[w.kanji.length - 1] === 'る' ? w.kanji.slice(0, -1) : w.kanji;
  const fs = w.furigana.slice(0, -1);
  return [
    row('辞書形', w.kanji, w.furigana, '原形'),
    row('ます形', ks + 'ます', fs + 'ます', '丁寧・現在肯定'),
    row('ません形', ks + 'ません', fs + 'ません', '丁寧・現在否定'),
    row('て形', ks + 'て', fs + 'て', '連用・接続'),
    row('た形', ks + 'た', fs + 'た', '普通・過去肯定'),
    row('ない形', ks + 'ない', fs + 'ない', '普通・現在否定'),
    row('なかった形', ks + 'なかった', fs + 'なかった', '普通・過去否定'),
  ];
}

function conjugateIrregular(w) {
  if (w.kanji === 'する')
    return [
      row('辞書形', 'する', 'する', '原形'),
      row('ます形', 'します', 'します', '丁寧・現在肯定'),
      row('ません形', 'しません', 'しません', '丁寧・現在否定'),
      row('て形', 'して', 'して', '連用・接続'),
      row('た形', 'した', 'した', '普通・過去肯定'),
      row('ない形', 'しない', 'しない', '普通・現在否定'),
      row('なかった形', 'しなかった', 'しなかった', '普通・過去否定'),
    ];
  if (w.kanji === '来る')
    return [
      row('辞書形', '来る', 'くる', '原形'),
      row('ます形', '来ます', 'きます', '丁寧・現在肯定'),
      row('ません形', '来ません', 'きません', '丁寧・現在否定'),
      row('て形', '来て', 'きて', '連用・接続'),
      row('た形', '来た', 'きた', '普通・過去肯定'),
      row('ない形', '来ない', 'こない', '普通・現在否定'),
      row('なかった形', '来なかった', 'こなかった', '普通・過去否定'),
    ];
  return [];
}

function conjugateAdjI(w) {
  const ks = w.kanji.slice(0, -1); // strip い
  const fs = w.furigana.slice(0, -1);
  return [
    row('現在・肯定', w.kanji, w.furigana, '〜い'),
    row('現在・否定', ks + 'くない', fs + 'くない', '〜くない'),
    row('過去・肯定', ks + 'かった', fs + 'かった', '〜かった'),
    row('過去・否定', ks + 'くなかった', fs + 'くなかった', '〜くなかった'),
    row('副詞形', ks + 'く', fs + 'く', '〜く（修飾動詞）'),
  ];
}

function conjugateAdjNa(w) {
  const { kanji: k, furigana: f } = w;
  return [
    row('現在・肯定', k + 'だ', f + 'だ', '〜だ'),
    row('現在・否定', k + 'じゃない', f + 'じゃない', '〜じゃない'),
    row('過去・肯定', k + 'だった', f + 'だった', '〜だった'),
    row('過去・否定', k + 'じゃなかった', f + 'じゃなかった', '〜じゃなかった'),
    row('連体形', k + 'な', f + 'な', '〜な（修飾名詞）'),
  ];
}

function conjugateNoun(w) {
  const { kanji: k, furigana: f } = w;
  return [
    row('現在・肯定', k + 'だ', f + 'だ', '〜だ'),
    row('現在・否定', k + 'じゃない', f + 'じゃない', '〜じゃない'),
    row('過去・肯定', k + 'だった', f + 'だった', '〜だった'),
    row('過去・否定', k + 'じゃなかった', f + 'じゃなかった', '〜じゃなかった'),
  ];
}

function conjugate(w) {
  switch (w.pos) {
    case 'verb_1':
      return conjugateGodan(w);
    case 'verb_2':
      return conjugateIchidan(w);
    case 'verb_3':
      return conjugateIrregular(w);
    case 'adj_i':
      return conjugateAdjI(w);
    case 'adj_na':
      return conjugateAdjNa(w);
    case 'noun':
      return conjugateNoun(w);
    default:
      return [];
  }
}

// Rule hints shown after wrong answer in conjugation quiz
function ruleHint(w, label) {
  const end = w.furigana[w.furigana.length - 1];
  if (label === 'て形') {
    if (w.pos === 'verb_1') {
      if (w.kanji === '行く') return '例外：行く → 行って（促音便，非い音便）';
      if (end === 'く') return '五段（く）→ て形：く → いて（い音便）';
      if (end === 'ぐ') return '五段（ぐ）→ て形：ぐ → いで（い音便）';
      if (end === 'す') return '五段（す）→ て形：す → して';
      if ('うつる'.includes(end)) return '五段（う/つ/る）→ て形：促音便 → って';
      if ('むぶぬ'.includes(end)) return '五段（む/ぶ/ぬ）→ て形：撥音便 → んで';
    }
    if (w.pos === 'verb_2') return '一段動詞 → て形：語幹（るを取る）+ て';
    if (w.pos === 'verb_3') return '不規則：する→して、来る→きて（暗記必須）';
  }
  if (label === 'ない形') {
    if (w.pos === 'verb_1') {
      if (end === 'う') return '五段（う）→ ない形：う → わない';
      return '五段動詞 → ない形：あ行に変換＋ない（く→か、む→ま、す→さ…）';
    }
    if (w.pos === 'verb_2') return '一段動詞 → ない形：語幹（るを取る）+ ない';
    if (w.pos === 'verb_3') return '不規則：する→しない、来る→こない（暗記必須）';
  }
  if (label === 'ます形') {
    if (w.pos === 'verb_1') return '五段動詞 → ます形：い段に変換＋ます（く→き、む→み、す→し…）';
    if (w.pos === 'verb_2') return '一段動詞 → ます形：語幹（るを取る）+ ます';
    if (w.pos === 'verb_3') return '不規則：する→します、来る→きます（暗記必須）';
  }
  if (label === 'た形') {
    if (w.pos === 'verb_1') return '五段動詞 → た形：て形と同じ音便規則（て→た、で→だ）';
    if (w.pos === 'verb_2') return '一段動詞 → た形：語幹（るを取る）+ た';
    if (w.pos === 'verb_3') return '不規則：する→した、来る→きた（暗記必須）';
  }
  return '';
}

// ═══════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════

const S = {
  tab: 'learn',
  selId: VOCAB[0].id,
  search: '',
  filterPos: 'all',
  quiz: {
    mode: 'meaning', // 'meaning' | 'conjugation'
    question: null,
    answered: false,
    selIdx: null,
    correct: 0,
    total: 0,
    hist: [], // last 10 results (bool)
  },
};

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

function ruby(kanji, furi) {
  if (kanji === furi) return `<span class="jp">${kanji}</span>`;
  return `<ruby class="jp">${kanji}<rt>${furi}</rt></ruby>`;
}

function filteredVocab() {
  const q = S.search.trim().toLowerCase();
  return VOCAB.filter((w) => {
    const pos = S.filterPos === 'all' || w.pos === S.filterPos;
    const text =
      !q ||
      w.kanji.includes(q) ||
      w.furigana.includes(q) ||
      w.romaji.toLowerCase().includes(q) ||
      w.zh.includes(q) ||
      w.en.toLowerCase().includes(q);
    return pos && text;
  });
}

function randPick(arr, n, excludeIds = []) {
  const pool = arr.filter((x) => !excludeIds.includes(x.id));
  const res = [];
  const copy = [...pool];
  for (let i = 0; i < n && copy.length; i++) {
    const j = Math.floor(Math.random() * copy.length);
    res.push(copy.splice(j, 1)[0]);
  }
  return res;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════
//  RENDER: LEARN TAB
// ═══════════════════════════════════════════════════════════════════

function renderFilter() {
  document.getElementById('pos-filter').innerHTML = FILTERS.map((f) => {
    const on = S.filterPos === f.key;
    return `<button onclick="setFilter('${f.key}')"
      class="px-2.5 py-1 text-xs rounded-full border transition-all ${
        on
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
      }">${f.label}</button>`;
  }).join('');
}

function renderWordList() {
  const list = filteredVocab();
  const el = document.getElementById('word-list');
  if (!list.length) {
    el.innerHTML = `<div class="text-center text-gray-400 py-8 text-sm">未找到匹配单词</div>`;
    return;
  }
  el.innerHTML = list
    .map((w) => {
      const on = w.id === S.selId;
      return `<div onclick="selectWord('${w.id}')"
      class="word-card flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        on ? 'word-card-on' : 'word-card-off'
      }">
      <div class="flex-1 min-w-0">
        <div class="text-lg leading-snug">${ruby(w.kanji, w.furigana)}</div>
        <div class="text-xs text-gray-400 mt-0.5">${w.zh} · <span class="font-mono">${w.romaji}</span></div>
      </div>
      <span class="text-xs px-1.5 py-0.5 rounded border flex-shrink-0 mt-1 ${POS_COLOR[w.pos]}">${POS_LABEL[w.pos]}</span>
    </div>`;
    })
    .join('');
}

function renderDetail() {
  const w = VOCAB.find((x) => x.id === S.selId);
  const el = document.getElementById('word-detail');
  if (!w) {
    el.innerHTML = '<p class="text-gray-400 text-center py-8">请选择一个单词</p>';
    return;
  }

  const rows = conjugate(w);
  el.className = 'bg-white rounded-xl border border-gray-100 shadow-sm p-6 fade-in';
  el.innerHTML = `
    <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
      <div>
        <div class="text-4xl mb-1.5 leading-normal">${ruby(w.kanji, w.furigana)}</div>
        <div class="text-xs text-gray-400 font-mono mb-2">${w.romaji}</div>
        <div class="flex flex-wrap gap-1.5">
          <span class="text-xs px-2 py-0.5 rounded-full border ${POS_COLOR[w.pos]}">${POS_LABEL[w.pos]}</span>
          ${w.note ? `<span class="text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-500">${w.note}</span>` : ''}
        </div>
      </div>
      <div class="text-right">
        <div class="text-2xl text-gray-800 mb-1">${w.zh}</div>
        <div class="text-sm text-gray-400">${w.en}</div>
      </div>
    </div>

    <div class="border-t border-gray-100 pt-4">
      <div class="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">変形一覧</div>
      <div class="space-y-0.5">
        ${rows
          .map(
            (r) => `
          <div class="conj-row flex items-baseline gap-3 py-2 px-2 -mx-2 rounded transition-colors">
            <div class="w-24 flex-shrink-0 text-xs text-gray-400 font-medium">${r.label}</div>
            <div class="flex-1">
              <span class="jp text-base text-gray-900">${r.kanji}</span>
              ${
                r.kanji !== r.furi
                  ? `<span class="jp text-xs text-gray-400 ml-2">（${r.furi}）</span>`
                  : ''
              }
            </div>
            <div class="text-xs text-gray-300 text-right hidden sm:block">${r.note}</div>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
//  RENDER: QUIZ TAB
// ═══════════════════════════════════════════════════════════════════

const CONJ_LABELS = ['て形', 'ない形', 'ます形', 'た形'];

function genMeaningQ() {
  const w = VOCAB[Math.floor(Math.random() * VOCAB.length)];
  const wrongs = randPick(VOCAB, 3, [w.id]).map((x) => x.zh);
  const options = shuffle([w.zh, ...wrongs]);
  return {
    type: 'meaning',
    w,
    prompt: '请选择正确的中文翻译：',
    options,
    correct: options.indexOf(w.zh),
    hint: null,
  };
}

function genConjQ() {
  const verbs = VOCAB.filter((x) => x.pos.startsWith('verb'));
  const w = verbs[Math.floor(Math.random() * verbs.length)];
  const label = CONJ_LABELS[Math.floor(Math.random() * CONJ_LABELS.length)];
  const conjs = conjugate(w);
  const target = conjs.find((r) => r.label === label);
  if (!target) return genMeaningQ();

  const correctFuri = target.furi;

  // Wrong options: same label from 3 other random verbs
  const others = randPick(verbs, 4, [w.id]);
  const wrongs = [];
  for (const ow of others) {
    if (wrongs.length >= 3) break;
    const oc = conjugate(ow);
    const orow = oc.find((r) => r.label === label);
    if (orow && orow.furi !== correctFuri) wrongs.push(orow.furi);
  }
  while (wrongs.length < 3) wrongs.push('―――');

  const options = shuffle([correctFuri, ...wrongs]);
  return {
    type: 'conjugation',
    w,
    label,
    prompt: `「${w.kanji}」的「${label}」是？`,
    options,
    correct: options.indexOf(correctFuri),
    hint: ruleHint(w, label),
  };
}

function genQuestion() {
  return S.quiz.mode === 'meaning' ? genMeaningQ() : genConjQ();
}

function renderQuizModes() {
  ['meaning', 'conjugation'].forEach((m) => {
    const btn = document.getElementById('qm-' + m);
    const on = m === S.quiz.mode;
    btn.className = `py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
      on
        ? 'border-blue-500 bg-blue-50 text-blue-700'
        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
    }`;
  });
}

function renderScoreDots() {
  document.getElementById('score-dots').innerHTML = S.quiz.hist
    .slice(-10)
    .map((ok) => `<div class="w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}"></div>`)
    .join('');
}

function renderScoreText() {
  const el = document.getElementById('score-text');
  const { correct, total } = S.quiz;
  if (!total) {
    el.textContent = '准备好了，开始！';
    return;
  }
  el.textContent = `${correct} / ${total}  正确率 ${Math.round((correct / total) * 100)}%`;
}

function renderQuestion() {
  const q = S.quiz.question;
  if (!q) return;

  // Question card
  const qCard = document.getElementById('question-card');
  qCard.className =
    'bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4 text-center min-h-36 flex flex-col items-center justify-center fade-in';
  qCard.innerHTML = `
    <p class="text-sm text-gray-400 mb-3">${q.prompt}</p>
    <div class="text-5xl leading-normal mb-2">${ruby(q.w.kanji, q.w.furigana)}</div>
    ${
      q.type === 'conjugation'
        ? `<span class="mt-2 inline-block px-3 py-0.5 bg-blue-50 text-blue-600 text-sm rounded-full jp">要求：${q.label}</span>`
        : ''
    }`;

  // Options
  const answered = S.quiz.answered;
  const sel = S.quiz.selIdx;
  const isJp = q.type === 'conjugation';
  document.getElementById('answer-options').innerHTML = q.options
    .map((opt, i) => {
      let cls = 'ans-btn';
      if (answered) {
        if (i === q.correct) cls = 'ans-show';
        else if (i === sel) cls = 'ans-wrong';
        else cls = 'ans-btn ans-dim';
      }
      return `<button onclick="selectAnswer(${i})" ${answered ? 'disabled' : ''}
      class="ans-btn ${cls} p-4 rounded-xl text-base font-medium ${isJp ? 'jp' : ''}">
      ${opt}
    </button>`;
    })
    .join('');

  // Feedback
  const fb = document.getElementById('quiz-feedback');
  if (answered) {
    const ok = sel === q.correct;
    fb.className = '';
    fb.innerHTML = `<div class="rounded-xl p-4 border ${
      ok
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : 'bg-red-50 border-red-200 text-red-800'
    }">
      <div class="flex items-center gap-2 font-medium text-sm">
        <span>${ok ? '✓ 正确！' : `✗ 正确答案：${q.options[q.correct]}`}</span>
      </div>
      ${
        q.hint && !ok
          ? `<p class="mt-1.5 text-xs text-gray-600 leading-relaxed">💡 ${q.hint}</p>`
          : ''
      }
    </div>`;
  } else {
    fb.className = 'hidden';
    fb.innerHTML = '';
  }

  // Next button
  const nb = document.getElementById('next-btn');
  nb.className = answered
    ? 'px-10 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors'
    : 'hidden';
}

// ═══════════════════════════════════════════════════════════════════
//  EVENT HANDLERS  (attached via onclick in HTML)
// ═══════════════════════════════════════════════════════════════════

function setTab(tab) {
  S.tab = tab;
  document.getElementById('learn-view').classList.toggle('hidden', tab !== 'learn');
  document.getElementById('quiz-view').classList.toggle('hidden', tab !== 'quiz');
  document.getElementById('tab-learn').className =
    `px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'learn' ? 'tab-on' : 'tab-off'}`;
  document.getElementById('tab-quiz').className =
    `px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'quiz' ? 'tab-on' : 'tab-off'}`;

  if (tab === 'quiz' && !S.quiz.question) {
    S.quiz.question = genQuestion();
    renderQuestion();
    renderScoreText();
    renderScoreDots();
  }
}

function selectWord(id) {
  S.selId = id;
  renderWordList();
  renderDetail();
}

function setFilter(pos) {
  S.filterPos = pos;
  renderFilter();
  renderWordList();
}

function onSearch(val) {
  S.search = val;
  renderWordList();
}

function setQuizMode(mode) {
  S.quiz.mode = mode;
  S.quiz.question = genQuestion();
  S.quiz.answered = false;
  S.quiz.selIdx = null;
  renderQuizModes();
  renderQuestion();
}

function selectAnswer(idx) {
  if (S.quiz.answered) return;
  const ok = idx === S.quiz.question.correct;
  S.quiz.answered = true;
  S.quiz.selIdx = idx;
  S.quiz.total++;
  if (ok) S.quiz.correct++;
  S.quiz.hist.push(ok);
  if (S.quiz.hist.length > 10) S.quiz.hist.shift();
  renderQuestion();
  renderScoreText();
  renderScoreDots();
}

function nextQuestion() {
  S.quiz.question = genQuestion();
  S.quiz.answered = false;
  S.quiz.selIdx = null;
  renderQuestion();
}

// ═══════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  renderFilter();
  renderWordList();
  renderDetail();
  renderScoreText();
  renderScoreDots();
});
