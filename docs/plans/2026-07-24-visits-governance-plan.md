# 3C 成本：visits 集合治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用确定性文档 ID 给 Firestore `visits` 集合的写入去重（同一身份同一天同一工具页最多一条），配合 Firestore TTL 自动清理 6 个月前的记录，收敛 5 个重复的写入点为一个共享模块。

**Architecture:** 判定/ID计算拆成纯函数（`track-visit-id.js`，可测），实际调 Firebase 的部分是装配层（`track-visit.js`，不测）——跟这次会话里 `auth-gate-state.js`/`auth-gate.js` 的分层完全一致。5 个写入点（`js/tracking.js` + 4 个工具页内联逻辑）改调用这个共享模块。

**Tech Stack:** 纯静态零构建，浏览器原生 ES Modules，Firebase Firestore，`node --test`。

---

## 背景（写代码前必读）

- 设计文档：`docs/specs/2026-07-24-visits-governance-design.md`（每个任务对应其中章节，任务里会标注）。
- 项目部署链路：本地 `git commit` → 手动 `git push`（先总结再推）→ 镜像 → Cloudflare 构建。**当前镜像链路故障**（`MIRROR_PAT` 待同事处理，约3周后），代码可以正常 push 到自己仓库，但人工验证要等镜像恢复才能做。
- `js/shared/package.json`（`{"type":"module"}`）已经在这次会话早些时候创建过了（3D稳定性那批任务），这次新增的 `js/shared/track-visit-id.js` 直接享受这个配置，**不需要再建一次 package.json**。
- 现有测试文件都在仓库根 `tests/` 目录，文件名 `<topic>.test.js`（CommonJS）或 `<topic>.test.mjs`（需要 import 时）。运行命令 `npm test`。
- 5 个写入点目前字段结构完全一致：`{email, anonId, page, timestamp, device}`，只有 `japanese_learner.html` 多写了一个从未被读取的 `title` 字段（已核实 `admin.html` 的聚合/展示逻辑不读这个字段），这次迁移时顺手去掉，不算功能回归。
- `admin.html` 的读取/聚合逻辑（`renderDashboard` 等）**完全不用改**，因为写入字段结构没变，只是把 `addDoc`（自动ID）换成了 `setDoc(...,{merge:true})`（确定性ID）。

---

### Task 1: `track-visit-id.js`（纯 ID 计算逻辑 + 测试）

对应设计文档 §3、§4、§7。

**Files:**
- Create: `js/shared/track-visit-id.js`
- Create: `tests/track-visit-id.test.mjs`

- [ ] **Step 1: 写失败的测试 `tests/track-visit-id.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visitDocId } from '../js/shared/track-visit-id.js';

test('visitDocId：同一身份/页面/日期产出相同ID（同一天内多次访问应该去重到一条）', () => {
  const a = visitDocId('user@x.com', 'translation', new Date('2026-07-24T01:00:00Z'));
  const b = visitDocId('user@x.com', 'translation', new Date('2026-07-24T23:00:00Z'));
  assert.equal(a, b);
});

test('visitDocId：不同身份产出不同ID', () => {
  const now = new Date('2026-07-24T10:00:00Z');
  assert.notEqual(
    visitDocId('user@x.com', 'translation', now),
    visitDocId('anon_abc123', 'translation', now),
  );
});

test('visitDocId：不同页面产出不同ID', () => {
  const now = new Date('2026-07-24T10:00:00Z');
  assert.notEqual(
    visitDocId('user@x.com', 'translation', now),
    visitDocId('user@x.com', 'lifestory', now),
  );
});

test('visitDocId：跨天产出不同ID', () => {
  assert.notEqual(
    visitDocId('user@x.com', 'translation', new Date('2026-07-24T23:59:59Z')),
    visitDocId('user@x.com', 'translation', new Date('2026-07-25T00:00:01Z')),
  );
});

test('visitDocId：格式为 identity_page_YYYY-MM-DD', () => {
  const id = visitDocId('user@x.com', 'translation', new Date('2026-07-24T10:00:00Z'));
  assert.equal(id, 'user@x.com_translation_2026-07-24');
});
```

- [ ] **Step 2: 运行测试确认因模块不存在而失败**

Run: `npm test`
Expected: FAIL，报错类似 `Cannot find module '../js/shared/track-visit-id.js'`

- [ ] **Step 3: 创建 `js/shared/track-visit-id.js`**

```js
// 访问统计去重用的确定性文档ID：同一身份（登录邮箱或匿名访客ID）同一天同一工具页
// 只对应一个ID，写入时用这个ID做 setDoc merge 就能自然去重，不需要额外查询判断。
// 零依赖，可被 node --test 直接测试；实际写 Firestore 的装配层在同目录 track-visit.js。
export function visitDocId(identity, page, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `${identity}_${page}_${day}`;
}
```

- [ ] **Step 4: 运行测试确认全部通过**

Run: `npm test`
Expected: PASS，新增的 5 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add js/shared/track-visit-id.js tests/track-visit-id.test.mjs
git commit -m "feat(shared): add visitDocId pure logic for visits dedup"
```
commit message 结尾要加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 2: `track-visit.js`（Firebase 装配层）

对应设计文档 §4。这个文件引用 Firebase CDN，只被浏览器加载，不写自动化测试。

**Files:**
- Create: `js/shared/track-visit.js`

- [ ] **Step 1: 创建 `js/shared/track-visit.js`**

```js
// 统一的访客统计写入：同一身份同一天同一工具页最多一条记录（确定性ID去重，merge更新）。
// ID 计算在 track-visit-id.js（纯函数，有单测）；这里是接 Firebase 的装配层。
//
// 用法：
//   import { trackVisit, updateVisitDuration } from '/js/shared/track-visit.js';
//   const docId = trackVisit({ db, email, anonId, page: 'translation', device: 'desktop' });
//   // 页面离开时：
//   updateVisitDuration({ db, docId, duration: 秒数 });
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { visitDocId } from './track-visit-id.js';

// 6个月，配合 Firestore TTL 策略（expireAt 字段）自动清理过期记录。
const RETENTION_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export function trackVisit({ db, email, anonId, page, device }) {
  const identity = email || anonId || 'unknown';
  const docId = visitDocId(identity, page);
  setDoc(
    doc(db, 'visits', docId),
    {
      email: email || null,
      anonId: anonId || null,
      page,
      device,
      timestamp: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + RETENTION_MS),
    },
    { merge: true },
  ).catch(() => {});
  return docId;
}

export function updateVisitDuration({ db, docId, duration }) {
  if (!docId) return;
  updateDoc(doc(db, 'visits', docId), {
    duration,
    expireAt: Timestamp.fromMillis(Date.now() + RETENTION_MS),
  }).catch(() => {});
}
```

- [ ] **Step 2: Commit**

```bash
git add js/shared/track-visit.js
git commit -m "feat(shared): add trackVisit/updateVisitDuration Firebase assembly layer"
```
commit message 结尾要加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 3: 迁移 `js/tracking.js`

对应设计文档 §4。

**Files:**
- Modify: `js/tracking.js`

- [ ] **Step 1: 替换整个文件内容**

把：
```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const app = initializeApp(
  {
    apiKey: 'AIzaSyCjtAqIrGkiqDiETUqxcmkhyBVoa2IHQNM',
    authDomain: 'senridfauthentication.firebaseapp.com',
    projectId: 'senridfauthentication',
    storageBucket: 'senridfauthentication.firebasestorage.app',
    messagingSenderId: '86494932585',
    appId: '1:86494932585:web:185b8ed922cd491a63fcf8',
  },
  'tracking',
);

const auth = getAuth(app);
const db = getFirestore(app);

function getPageName() {
  const p = location.pathname;
  if (p.includes('japanese_learner')) return 'japanese_learner';
  if (p.includes('analysis')) return 'analysis';
  if (p.includes('lifestory')) return 'lifestory';
  if (p.includes('translation')) return 'translation';
  if (p.includes('/solutions/demo')) return 'demo-index';
  if (p.includes('/solutions')) return 'solutions';
  if (p.includes('/about')) return 'about';
  if (p.includes('/blog')) return 'blog';
  return 'home';
}

function getAnonId() {
  let id = localStorage.getItem('sdf_anon_id');
  if (!id) {
    id = 'anon_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('sdf_anon_id', id);
  }
  return id;
}

const startTime = Date.now();
let visitRef = null;

async function track() {
  try {
    await signInAnonymously(auth);
    const email = localStorage.getItem('sdf_user_email') || null;
    const ref = await addDoc(collection(db, 'visits'), {
      email,
      anonId: getAnonId(),
      page: getPageName(),
      timestamp: serverTimestamp(),
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    });
    visitRef = ref;
  } catch {}
}

async function finish() {
  if (!visitRef) return;
  const duration = Math.round((Date.now() - startTime) / 1000);
  try {
    await updateDoc(visitRef, { duration });
  } catch {}
  visitRef = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') finish();
});

track();
```

改成：
```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { trackVisit, updateVisitDuration } from '/js/shared/track-visit.js';

const app = initializeApp(
  {
    apiKey: 'AIzaSyCjtAqIrGkiqDiETUqxcmkhyBVoa2IHQNM',
    authDomain: 'senridfauthentication.firebaseapp.com',
    projectId: 'senridfauthentication',
    storageBucket: 'senridfauthentication.firebasestorage.app',
    messagingSenderId: '86494932585',
    appId: '1:86494932585:web:185b8ed922cd491a63fcf8',
  },
  'tracking',
);

const auth = getAuth(app);
const db = getFirestore(app);

function getPageName() {
  const p = location.pathname;
  if (p.includes('japanese_learner')) return 'japanese_learner';
  if (p.includes('analysis')) return 'analysis';
  if (p.includes('lifestory')) return 'lifestory';
  if (p.includes('translation')) return 'translation';
  if (p.includes('/solutions/demo')) return 'demo-index';
  if (p.includes('/solutions')) return 'solutions';
  if (p.includes('/about')) return 'about';
  if (p.includes('/blog')) return 'blog';
  return 'home';
}

function getAnonId() {
  let id = localStorage.getItem('sdf_anon_id');
  if (!id) {
    id = 'anon_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('sdf_anon_id', id);
  }
  return id;
}

const startTime = Date.now();
let visitDocIdRef = null;

async function track() {
  try {
    await signInAnonymously(auth);
    const email = localStorage.getItem('sdf_user_email') || null;
    visitDocIdRef = trackVisit({
      db,
      email,
      anonId: getAnonId(),
      page: getPageName(),
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    });
  } catch {}
}

function finish() {
  if (!visitDocIdRef) return;
  const duration = Math.round((Date.now() - startTime) / 1000);
  updateVisitDuration({ db, docId: visitDocIdRef, duration });
  visitDocIdRef = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') finish();
});

track();
```

（`getPageName`/`getAnonId`/Firebase app 初始化/`signInAnonymously` 逻辑完全不变，只替换了"怎么写入 visits"这部分。`finish()` 不再需要 `async`/`try/catch`——`updateVisitDuration` 内部自己处理了失败静默。）

- [ ] **Step 2: Lint 确认没有语法问题**

Run: `npx eslint js/tracking.js`
Expected: 无报错输出

- [ ] **Step 3: Commit**

```bash
git add js/tracking.js
git commit -m "refactor(tracking): migrate to shared trackVisit/updateVisitDuration"
```
commit message 结尾要加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 4: 迁移 4 个工具页的内联访问统计

对应设计文档 §4。`translation.html` 已经在上一轮"3D稳定性"里迁移用了 `mountAuthGate`，这次只改它的 `_track`/`_anonId`/`visibilitychange` 部分；`lifestory.html`/`analysis.html`/`japanese_learner.html` 还是旧的内联 `onAuthStateChanged` 模式（不在这次范围内，这次只改访问统计写入部分，登录门控逻辑本身不动）。

**Files:**
- Modify: `solutions/demo/translation.html`
- Modify: `solutions/demo/lifestory.html`
- Modify: `solutions/demo/analysis.html`
- Modify: `solutions/demo/japanese_learner.html`

- [ ] **Step 1: `solutions/demo/translation.html`**

把：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { mountAuthGate } from '/js/shared/auth-gate.js';
import {collection,addDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const _start=Date.now();let _ref=null,_logged=false;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
function _track(e){if(_logged)return;_logged=true;addDoc(collection(db,'visits'),{email:e,anonId:_anonId(),page:'translation',timestamp:serverTimestamp(),device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'}).then(r=>{_ref=r;}).catch(()=>{});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_ref){updateDoc(_ref,{duration:Math.round((Date.now()-_start)/1000)}).catch(()=>{});_ref=null;}});
window.sdfGetToken=()=>auth.currentUser?.getIdToken();
mountAuthGate({
  auth,
  db,
  onApproved: (user) => _track(user.email),
  onAdmin: (user) => _track(user.email),
});
</script>
```
改成：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { mountAuthGate } from '/js/shared/auth-gate.js';
import { trackVisit, updateVisitDuration } from '/js/shared/track-visit.js';
const _start=Date.now();let _docId=null,_logged=false;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
function _track(e){if(_logged)return;_logged=true;_docId=trackVisit({db,email:e,anonId:_anonId(),page:'translation',device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_docId){updateVisitDuration({db,docId:_docId,duration:Math.round((Date.now()-_start)/1000)});_docId=null;}});
window.sdfGetToken=()=>auth.currentUser?.getIdToken();
mountAuthGate({
  auth,
  db,
  onApproved: (user) => _track(user.email),
  onAdmin: (user) => _track(user.email),
});
</script>
```

- [ ] **Step 2: `solutions/demo/lifestory.html`**

把：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { ADMINS } from '/js/shared/admins.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {collection,doc,getDoc,addDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
window.sdfGetToken=()=>auth.currentUser?.getIdToken();
const _start=Date.now();let _ref=null,_logged=false;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
function _track(e){if(_logged)return;_logged=true;addDoc(collection(db,'visits'),{email:e,anonId:_anonId(),page:'lifestory',timestamp:serverTimestamp(),device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'}).then(r=>{_ref=r;}).catch(()=>{});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_ref){updateDoc(_ref,{duration:Math.round((Date.now()-_start)/1000)}).catch(()=>{});_ref=null;}});
onAuthStateChanged(auth,async user=>{
```
改成：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { ADMINS } from '/js/shared/admins.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {doc,getDoc} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { trackVisit, updateVisitDuration } from '/js/shared/track-visit.js';
window.sdfGetToken=()=>auth.currentUser?.getIdToken();
const _start=Date.now();let _docId=null,_logged=false;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
function _track(e){if(_logged)return;_logged=true;_docId=trackVisit({db,email:e,anonId:_anonId(),page:'lifestory',device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_docId){updateVisitDuration({db,docId:_docId,duration:Math.round((Date.now()-_start)/1000)});_docId=null;}});
onAuthStateChanged(auth,async user=>{
```

**其余部分（`gate`/`ADMINS`判定/`getDoc`查状态/pending·disabled 提示 HTML）保持完全不变，只改动上面这几行。**

- [ ] **Step 3: `solutions/demo/analysis.html`**

把：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { ADMINS } from '/js/shared/admins.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {collection,doc,getDoc,addDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const _start=Date.now();let _ref=null,_logged=false;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
function _track(e){if(_logged)return;_logged=true;addDoc(collection(db,'visits'),{email:e,anonId:_anonId(),page:'analysis',timestamp:serverTimestamp(),device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'}).then(r=>{_ref=r;}).catch(()=>{});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_ref){updateDoc(_ref,{duration:Math.round((Date.now()-_start)/1000)}).catch(()=>{});_ref=null;}});
onAuthStateChanged(auth,async user=>{
```
改成：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { ADMINS } from '/js/shared/admins.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {doc,getDoc} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { trackVisit, updateVisitDuration } from '/js/shared/track-visit.js';
const _start=Date.now();let _docId=null,_logged=false;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
function _track(e){if(_logged)return;_logged=true;_docId=trackVisit({db,email:e,anonId:_anonId(),page:'analysis',device:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_docId){updateVisitDuration({db,docId:_docId,duration:Math.round((Date.now()-_start)/1000)});_docId=null;}});
onAuthStateChanged(auth,async user=>{
```

**其余部分（`gate`/`ADMINS`判定/`getDoc`查状态/pending·disabled 提示 HTML）保持完全不变，只改动上面这几行。**

- [ ] **Step 4: `solutions/demo/japanese_learner.html`**

这个文件结构不同（写入逻辑内嵌在 `showTool()` 函数里，且多写了一个从未被读取的 `title` 字段，这次顺手去掉）。

把：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { ADMINS } from '/js/shared/admins.js';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {collection,addDoc,serverTimestamp,doc,getDoc,updateDoc} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const gate = document.getElementById('gate');
const gateStatus = document.getElementById('gate-status');
let _logged = false;
const _start = Date.now(); let _ref = null;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_ref){updateDoc(_ref,{duration:Math.round((Date.now()-_start)/1000)}).catch(()=>{});_ref=null;}});

function showTool(u) {
  gate.style.display = 'none';
  gateStatus.style.display = 'none';
  document.getElementById('uarea').style.display = 'flex';
  document.getElementById('uemail').textContent = u.email;
  if (!_logged) {
    _logged = true;
    addDoc(collection(db, 'visits'), {
      email: u.email,
      anonId: _anonId(),
      page: 'japanese_learner',
      title: '日本語動詞活用',
      timestamp: serverTimestamp(),
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
    }).then(r => { _ref = r; }).catch(() => {});
  }
}
```
改成：
```html
<script type="module">
import { auth, db } from '/js/shared/firebase-init.js';
import { ADMINS } from '/js/shared/admins.js';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {doc,getDoc} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { trackVisit, updateVisitDuration } from '/js/shared/track-visit.js';
const gate = document.getElementById('gate');
const gateStatus = document.getElementById('gate-status');
let _logged = false;
const _start = Date.now(); let _docId = null;
function _anonId(){let i=localStorage.getItem('sdf_anon_id');if(!i){i='anon_'+Math.random().toString(36).slice(2,9);localStorage.setItem('sdf_anon_id',i);}return i;}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&_docId){updateVisitDuration({db,docId:_docId,duration:Math.round((Date.now()-_start)/1000)});_docId=null;}});

function showTool(u) {
  gate.style.display = 'none';
  gateStatus.style.display = 'none';
  document.getElementById('uarea').style.display = 'flex';
  document.getElementById('uemail').textContent = u.email;
  if (!_logged) {
    _logged = true;
    _docId = trackVisit({
      db,
      email: u.email,
      anonId: _anonId(),
      page: 'japanese_learner',
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    });
  }
}
```

（`updateDoc`/`collection`/`addDoc`/`serverTimestamp` 在这个文件里只在访问统计这一处用到，已核实全文件搜索没有其他用途，可以放心从 import 里去掉。`title` 字段去掉——`admin.html` 从未读取过这个字段，不是功能回归。其余 `onAuthStateChanged`/`signInWithEmailAndPassword`/密码重置等逻辑保持不变。）

- [ ] **Step 5: 运行 lint 和 qa 扫描确认没有破坏页面**

Run: `npx eslint solutions/demo/translation.html solutions/demo/lifestory.html solutions/demo/analysis.html solutions/demo/japanese_learner.html && npm run qa`
Expected: 都无报错（`.html` 内嵌 script 的 "File ignored" warning 是既有正常现象，`npm run qa` 应该 PASS）

- [ ] **Step 6: Commit**

```bash
git add solutions/demo/translation.html solutions/demo/lifestory.html solutions/demo/analysis.html solutions/demo/japanese_learner.html
git commit -m "refactor(tools): migrate 4 inline visit-tracking blocks to shared trackVisit"
```
commit message 结尾要加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 5: `admin.html` 读取上限调整

对应设计文档 §6。

**Files:**
- Modify: `solutions/demo/admin.html`

- [ ] **Step 1: 调大 limit**

把：
```js
    const q = query(collection(db, 'visits'), orderBy('timestamp', 'desc'), limit(500));
```
改成：
```js
    const q = query(collection(db, 'visits'), orderBy('timestamp', 'desc'), limit(2000));
```

- [ ] **Step 2: Lint 确认没有语法问题**

Run: `npx eslint solutions/demo/admin.html`
Expected: 无报错输出（`.html` 内嵌 script 的"File ignored" warning 属正常现象）

- [ ] **Step 3: Commit**

```bash
git add solutions/demo/admin.html
git commit -m "chore(admin): raise visits read limit 500 -> 2000"
```
commit message 结尾要加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 6: 更新 `docs/TOOLS.md`

**Files:**
- Modify: `docs/TOOLS.md`

- [ ] **Step 1**：先用 Read 工具通读一遍 `docs/TOOLS.md`，找到描述 `js/shared/` 共享模块的段落和"修改记录"章节最近条目（比如 2026-07-24 那几条 3D 稳定性的记录）的具体格式。

- [ ] **Step 2**：在 `js/shared/` 描述段落里补充说明新增的两个文件：
  - `track-visit-id.js`：纯逻辑 `visitDocId(identity, page, now)`，确定性ID去重（可测）
  - `track-visit.js`：`trackVisit({db,email,anonId,page,device})`/`updateVisitDuration({db,docId,duration})` 装配层，同一身份同一天同一工具页最多一条 `visits` 记录（`setDoc`+`merge`），每条记录带 `expireAt`（写入时间+6个月）配合 Firestore TTL 策略自动清理；替代过去 5 处重复写入点（`js/tracking.js` + 4 个工具页内联逻辑）

- [ ] **Step 3**：在"修改记录"章节末尾追加一条（日期用 2026-07-24，格式跟你在 Step 1 确认的真实格式一致）：
```
新建 js/shared/track-visit.js（+track-visit-id.js 纯逻辑）：visits 集合写入统一去重（同一身份同一天同一工具页最多一条），每条记录带 expireAt 字段配合 Firestore TTL（6个月，需在 Firebase 控制台配置策略）自动清理
js/tracking.js + 4 个工具页（translation/lifestory/analysis/japanese_learner）的内联访问统计，全部迁移到共享 trackVisit/updateVisitDuration
admin.html 的 visits 读取上限从 500 调大到 2000
⚠️ 待办：需在 Firebase 控制台确认 visits 集合规则允许 update（不只 create），否则同一天第二次写入会静默失败
```

- [ ] **Step 4: Commit**

```bash
git add docs/TOOLS.md
git commit -m "docs: record 3C visits governance changes in TOOLS.md"
```
commit message 结尾要加：
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 7: 人工验证 + Firebase 控制台一次性设置（不是代码改动）

这一步不分派子代理，是留给用户在镜像恢复、`wrangler`/`git push` 之后手动做的：

- [ ] 1. Firebase 控制台 → Firestore → TTL → 新建策略 → 集合 `visits`，字段 `expireAt`
- [ ] 2. Firebase 控制台 → Firestore 规则 → 确认 `visits` 集合规则允许 `create` **和** `update`（现有规则如果只放行 `create`，同一天第二次写入会被拒绝、被 `.catch(()=>{})` 静默吞掉）
- [ ] 3. `git push`（需要用户确认）
- [ ] 4. 镜像恢复后，线上验证：同一账号同一天在同一工具页多次访问/刷新，确认 Firestore `visits` 集合里只产生一条文档、`timestamp`/`duration` 随访问更新；跨天访问确认产生新文档；打开 `admin.html` 确认统计面板正常显示

---

## Spec 覆盖率自查

| 设计文档章节 | 对应任务 |
|---|---|
| §3 确定性文档ID去重机制 | Task 1 |
| §4 共享模块 + 5个写入点迁移 | Task 1（纯逻辑）、Task 2（装配层）、Task 3（tracking.js）、Task 4（4个工具页） |
| §5 Firestore TTL + 规则调整 | Task 7（人工设置） |
| §6 admin.html 读取端 | Task 5 |
| §7 测试 | Task 1（visitDocId测试）、Task 7（人工验证） |
| §8 错误处理 | Task 2（`.catch(()=>{})`静默失败，与既有写入点行为一致） |
| 范围外（服务端聚合、退役visits、admin.html展示逻辑改动） | 未新增对应任务，符合预期 |

placeholder/类型一致性自查：`visitDocId`、`trackVisit`、`updateVisitDuration`、`_docId`（替代原来的 `_ref`/`visitRef`）这些命名在所有任务里保持一致，没有前后不一致的函数名/变量名。
