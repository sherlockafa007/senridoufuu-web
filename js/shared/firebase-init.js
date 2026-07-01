// 唯一一份 Firebase 初始化。所有页面 import 这里的 app / auth / db，
// 不要再在页面里各自 initializeApp（避免配置漂移与 SDK 版本不一致）。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCjtAqIrGkiqDiETUqxcmkhyBVoa2IHQNM',
  authDomain: 'senridfauthentication.firebaseapp.com',
  projectId: 'senridfauthentication',
  storageBucket: 'senridfauthentication.firebasestorage.app',
  messagingSenderId: '86494932585',
  appId: '1:86494932585:web:185b8ed922cd491a63fcf8',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
