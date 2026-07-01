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
