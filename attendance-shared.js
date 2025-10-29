// attendance-shared.js
(function(){
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);

  const auth = firebase.auth();
  const db   = firebase.firestore();

  async function getUserRole(){
    const u = auth.currentUser;
    if (!u) return '';
    try {
      const snap = await db.collection('rollen').doc(u.uid).get();
      if (!snap.exists) return '';
      const roleRaw = (snap.data().role || '').toString().trim().toLowerCase();
      if (['administrator','admins','adminstrator','admin'].includes(roleRaw)) return 'admin';
      if (['trainer/in','trainerin','coach','trainer'].includes(roleRaw)) return 'trainer';
      if (['si-fu','sifu','si fu','si‐fu','si‒fu'].includes(roleRaw)) return 'si-fu';
      return roleRaw;
    } catch (e) {
      console.warn('getUserRole() failed:', e);
      return '';
    }
  }

  function newNonce(){
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');
  }

  function buildQrPayload(sessionId, nonce){
    return JSON.stringify({ t:'WT', v:1, s:sessionId, n:nonce });
  }

  function parseQrPayload(txt){
    try { const o = JSON.parse(txt); if (o && o.t==='WT' && o.v===1 && o.s && o.n) return o; } catch(e){}
    return null;
  }

  async function assertAdminOrSiFu(){
    const r = await getUserRole();
    if (!['admin','si-fu'].includes(r)) throw new Error('Nur für Admin/Si-Fu.');
  }

  window._att = { auth, db, getUserRole, newNonce, buildQrPayload, parseQrPayload, assertAdminOrSiFu };
})();
