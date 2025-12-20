'use strict';

const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const routeHelpers = require.main.require('./src/controllers/helpers');
const nconf = require.main.require('nconf');

const Plugin = {};

// =========================
// AYARLAR
// =========================
const SETTINGS = {
  pointsPerHeartbeat: 5,
  dailyCap: 250,
  coffeeCost: 250,
};

// ✅ TEST: sınırsız kullanım (puan kontrolünü kapatmak için true)
const TEST_MODE_UNLIMITED = false;

// =========================
// JSON SAFE HELPERS
// =========================
function safeParseMaybeJson(x) {
  if (x == null) return null;

  // bazı DB’lerde object dönebilir
  if (typeof x === 'object') return x;

  if (typeof x === 'string') {
    try {
      return JSON.parse(x);
    } catch (e) {
      // "[object Object]" gibi bozuk kayıtları atla
      return null;
    }
  }
  return null;
}

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return null;
  }
}

function makeProfileUrl(userslug) {
  const rp = nconf.get('relative_path') || '';
  if (!userslug) return '';
  return `${rp}/user/${userslug}`;
}

// =========================
// LOG FONKSİYONLARI
// =========================
async function addUserLog(uid, type, amount, desc) {
  const logEntry = {
    ts: Date.now(),
    type, // 'earn' | 'spend'
    amt: amount,
    txt: desc,
  };

  const payload = safeStringify(logEntry);
  if (!payload) return;

  await db.listAppend(`niki:activity:${uid}`, payload);
  await db.listTrim(`niki:activity:${uid}`, -50, -1);
}

async function addKasaLog(staffUid, customerName, customerUid) {
  const logEntry = {
    ts: Date.now(),
    staff: staffUid,
    cust: customerName,     // bazen eski kayıtlarda boş olabilir, endpoint tamamlayacak
    cuid: customerUid,
    amt: SETTINGS.coffeeCost,
  };

  const payload = safeStringify(logEntry);
  if (!payload) return;

  await db.listAppend('niki:kasa:history', payload);
  await db.listTrim('niki:kasa:history', -100, -1);
}

// =========================
// INIT
// =========================
Plugin.init = async function (params) {
  const router = params.router;
  const middleware = params.middleware;

  // 1) HEARTBEAT (puan kazanma)
  router.post('/api/niki-loyalty/heartbeat', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const dailyKey = `niki:daily:${uid}:${today}`;

      const currentDailyScore = parseInt((await db.getObjectField(dailyKey, 'score')) || 0, 10);

      if (currentDailyScore >= SETTINGS.dailyCap) {
        return res.json({ earned: false, reason: 'daily_cap' });
      }

      await user.incrementUserFieldBy(uid, 'niki_points', SETTINGS.pointsPerHeartbeat);
      await db.incrObjectFieldBy(dailyKey, 'score', SETTINGS.pointsPerHeartbeat);

      const newBalance = await user.getUserField(uid, 'niki_points');
      return res.json({ earned: true, points: SETTINGS.pointsPerHeartbeat, total: newBalance });
    } catch (err) {
      return res.status(500).json({ earned: false, reason: 'server_error' });
    }
  });

  // 2) WALLET DATA (cüzdan + geçmiş)
  router.get('/api/niki-loyalty/wallet-data', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      const [userData, dailyData, historyRaw] = await Promise.all([
        user.getUserFields(uid, ['niki_points']),
        db.getObject(`niki:daily:${uid}:${today}`),
        db.getListRange(`niki:activity:${uid}`, 0, -1),
      ]);

      const currentPoints = parseInt(userData?.niki_points || 0, 10);
      const dailyScore = parseInt(dailyData?.score || 0, 10);

      let dailyPercent = (dailyScore / SETTINGS.dailyCap) * 100;
      if (dailyPercent > 100) dailyPercent = 100;

      // ✅ history parse güvenli
      const history = (historyRaw || [])
        .map(safeParseMaybeJson)
        .filter(Boolean)
        .reverse();

      return res.json({
        points: currentPoints,
        dailyScore,
        dailyCap: SETTINGS.dailyCap,
        dailyPercent,
        history,
      });
    } catch (err) {
      return res.status(500).json({
        points: 0,
        dailyScore: 0,
        dailyCap: SETTINGS.dailyCap,
        dailyPercent: 0,
        history: [],
      });
    }
  });

  // 3) KASA HISTORY (admin/mod)
router.get('/api/niki-loyalty/kasa-history', middleware.ensureLoggedIn, async (req, res) => {
  try {
    const isAdmin = await user.isAdministrator(req.uid);
    const isMod = await user.isGlobalModerator(req.uid);
    if (!isAdmin && !isMod) return res.status(403).json([]);

    const raw = await db.getListRange('niki:kasa:history', 0, -1);

    // Kayıtlar bazen JSON string, bazen bozuk olabilir → güvenli parse
    const rows = (raw || [])
      .map((x) => {
        if (!x) return null;
        if (typeof x === 'object') return x;
        if (typeof x === 'string') {
          try { return JSON.parse(x); } catch (e) { return null; }
        }
        return null;
      })
      .filter(Boolean)
      .reverse();

    // cuid’lerden uid listesi çıkar
    const uids = rows
      .map(r => parseInt(r.cuid, 10))
      .filter(n => Number.isFinite(n) && n > 0);

    // NodeBB core user datası (profile-looks mantığı)
    const users = await user.getUsersFields(uids, [
      'uid', 'username', 'userslug', 'picture', 'icon:bgColor',
    ]);

    const userMap = {};
    (users || []).forEach(u => { userMap[u.uid] = u; });

    const rp = nconf.get('relative_path') || '';

    const enriched = rows.map(r => {
      const uid = parseInt(r.cuid, 10);
      const u = userMap[uid];
      if (!u) return r;

      return {
        ...r,
        cust: u.username || r.cust || 'Bilinmeyen',
        userslug: u.userslug || r.userslug || '',
        picture: u.picture || r.picture || '',
        iconBg: u['icon:bgColor'] || r.iconBg || '#4b5563',
        profileUrl: (u.userslug ? `${rp}/user/${u.userslug}` : ''),
      };
    });

    return res.json(enriched);
  } catch (err) {
    return res.status(500).json([]);
  }
});



  // 4) QR OLUŞTUR
  router.post('/api/niki-loyalty/generate-qr', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      const points = parseInt((await user.getUserField(uid, 'niki_points')) || 0, 10);

      if (!TEST_MODE_UNLIMITED && points < SETTINGS.coffeeCost) {
        return res.json({ success: false, message: 'Yetersiz Puan' });
      }

      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

      await db.set(`niki:qr:${token}`, uid);
      await db.expire(`niki:qr:${token}`, 120);

      return res.json({ success: true, token });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
  });

  // 5) QR OKUT (admin/mod)
  router.post('/api/niki-loyalty/scan-qr', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const token = (req.body && req.body.token) ? String(req.body.token) : '';

      const isAdmin = await user.isAdministrator(req.uid);
      const isMod = await user.isGlobalModerator(req.uid);
      if (!isAdmin && !isMod) return res.status(403).json({ success: false, message: 'Yetkisiz' });

      const customerUid = await db.get(`niki:qr:${token}`);
      if (!customerUid) return res.json({ success: false, message: 'Geçersiz Kod' });

      const pts = parseInt((await user.getUserField(customerUid, 'niki_points')) || 0, 10);
      if (!TEST_MODE_UNLIMITED && pts < SETTINGS.coffeeCost) {
        return res.json({ success: false, message: 'Yetersiz Bakiye' });
      }

      // ✅ puan düşür
      if (!TEST_MODE_UNLIMITED) {
        await user.decrementUserFieldBy(customerUid, 'niki_points', SETTINGS.coffeeCost);
      }

      // token tek kullanımlık
      await db.delete(`niki:qr:${token}`);

      // müşteri bilgisi
      const customerData = await user.getUserFields(customerUid, ['username', 'picture', 'userslug']);

      // user log
      await addUserLog(customerUid, 'spend', SETTINGS.coffeeCost, 'Kahve Keyfi ☕');

      // kasa log
      await addKasaLog(req.uid, customerData?.username || 'Bilinmeyen', customerUid);

      return res.json({
        success: true,
        customer: customerData,
        message: 'Onaylandı!',
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }
  });

  // 6) SAYFA ROTASI (kasa sayfası)
  routeHelpers.setupPageRoute(router, '/niki-kasa', middleware, [], async (req, res) => {
    const isAdmin = await user.isAdministrator(req.uid);
    const isMod = await user.isGlobalModerator(req.uid);
    if (!isAdmin && !isMod) return res.render('403', {});
    return res.render('niki-kasa', { title: 'Niki Kasa' });
  });
};

// client.js inject
Plugin.addScripts = async function (scripts) {
  scripts.push('plugins/nodebb-plugin-niki-loyalty/static/lib/client.js');
  return scripts;
};

// navigation
Plugin.addNavigation = async function (nav) {
  nav.push({
    route: '/niki-wallet',
    title: 'Niki Cüzdan',
    enabled: true,
    iconClass: 'fa-coffee',
    text: 'Niki Cüzdan',
  });
  return nav;
};

module.exports = Plugin;
