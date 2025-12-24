'use strict';

const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const posts = require.main.require('./src/posts');
const routeHelpers = require.main.require('./src/controllers/helpers');
const nconf = require.main.require('nconf');
const socketHelpers = require.main.require('./src/socket.io/index');
const Plugin = {};

// =========================
// ⚙️ AYARLAR & KURALLAR (GAME LOGIC)
// =========================
const SETTINGS = {
  dailyCap: 35, // Günlük Maksimum Puan
};

// Puan Tablosu ve Limitleri
const ACTIONS = {
  login: { points: 2, limit: 1, name: 'Günlük Giriş 👋' },
  new_topic: { points: 7, limit: 1, name: 'Yeni Konu 📝' },
  reply: { points: 3.5, limit: 2, name: 'Yorum Yazma 💬' },
  read: { points: 1, limit: 8, name: 'Konu Okuma 👀' }, // Heartbeat ile çalışır
  like_given: { points: 4, limit: 2, name: 'Beğeni Atma ❤️' },   // 4 puan x 2 = max 8
  like_taken: { points: 5, limit: 2, name: 'Beğeni Alma 🌟' }    // 5 puan x 2 = max 10
};

// Ödüller
const REWARDS = [
  { cost: 250, name: 'Ücretsiz Kahve ☕' },
  { cost: 180, name: '%60 İndirimli Kahve' },
  { cost: 120, name: '%30 İndirimli Kahve' },
  { cost: 60, name: '1 Kurabiye 🍪' },
];

const TEST_MODE_UNLIMITED = false;

// =========================
// 🛠 YARDIMCI FONKSİYONLAR
// =========================
function safeParseMaybeJson(x) {
  if (x == null) return null;
  if (typeof x === 'object') return x;
  try { return JSON.parse(x); } catch (e) { return null; }
}

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch (e) { return null; }
}

async function addUserLog(uid, type, amount, desc) {
  const logEntry = { ts: Date.now(), type, amt: amount, txt: desc };
  const payload = safeStringify(logEntry);
  if (!payload) return;
  await db.listAppend(`niki:activity:${uid}`, payload);
  await db.listTrim(`niki:activity:${uid}`, -50, -1);
}

async function addKasaLog(staffUid, customerName, customerUid, rewardName, amount) {
  const logEntry = {
    ts: Date.now(), staff: staffUid, cust: customerName, cuid: customerUid, amt: amount, reward: rewardName
  };
  const payload = safeStringify(logEntry);
  if (!payload) return;
  await db.listAppend('niki:kasa:history', payload);
  await db.listTrim('niki:kasa:history', -100, -1);
}

// 🔥 MERKEZİ PUAN DAĞITIM FONKSİYONU 🔥
// Bütün puan işlemleri buradan geçer, limitleri kontrol eder.
// 🔥 MERKEZİ PUAN DAĞITIM FONKSİYONU 🔥
async function awardDailyAction(uid, actionKey) {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rule = ACTIONS[actionKey];

    if (!rule) return;

    // 1. Genel Günlük Limit Kontrolü
    const dailyScoreKey = `niki:daily:${uid}:${today}`;
    const currentDailyScore = parseFloat((await db.getObjectField(dailyScoreKey, 'score')) || 0);
    if (currentDailyScore >= SETTINGS.dailyCap) return;

    // 2. Eylem Bazlı Limit Kontrolü
    const actionCountKey = `niki:daily:${uid}:${today}:counts`;
    const currentActionCount = parseInt((await db.getObjectField(actionCountKey, actionKey)) || 0, 10);
    if (currentActionCount >= rule.limit) return;

    // 3. Puan Hesapla
    let pointsToGive = rule.points;
    if (currentDailyScore + pointsToGive > SETTINGS.dailyCap) {
      pointsToGive = SETTINGS.dailyCap - currentDailyScore;
    }
    if (pointsToGive <= 0) return;

    // 4. DB Güncellemeleri
    await user.incrementUserFieldBy(uid, 'niki_points', pointsToGive);
    await db.incrObjectFieldBy(dailyScoreKey, 'score', pointsToGive);
    await db.incrObjectFieldBy(actionCountKey, actionKey, 1);

    // Logla
    await addUserLog(uid, 'earn', pointsToGive, rule.name);

    // ✅ YENİ EKLENEN KISIM: Kullanıcıya Bildirim Gönder (Socket Emit)
    if (socketHelpers && socketHelpers.server) {
      socketHelpers.server.sockets.in('uid_' + uid).emit('event:niki_award', {
        title: 'Tebrikler! 🥳',
        message: `${rule.name} işleminden <strong style="color:#ffd700">+${pointsToGive} Puan</strong> kazandın!`,
        newTotal: parseFloat((await user.getUserField(uid, 'niki_points')) || 0)
      });
    }

  } catch (err) {
    console.error(`[Niki-Loyalty] Error awarding points for ${actionKey}:`, err);
  }
}


// =========================
// ⚓ HOOKS (Olay Dinleyicileri)
// =========================

// 1. GÜNLÜK GİRİŞ (Login)
Plugin.onLogin = async function (data) {
  if (!data || !data.uid) return;
  await awardDailyAction(data.uid, 'login');
};

// 2. YENİ KONU AÇMA
Plugin.onTopicCreate = async function (data) {
  // data.topic.uid konusuyu açan kişidir
  if (!data || !data.topic || !data.topic.uid) return;
  await awardDailyAction(data.topic.uid, 'new_topic');
};

// 3. YORUM YAZMA (Reply)
Plugin.onPostCreate = async function (data) {
  if (!data || !data.post || !data.post.uid) return;

  // Eğer post "main" ise (yani konunun kendisi ise) yorum sayılmaz, konu sayılır.
  // NodeBB'de isMain kontrolü:
  const isMain = await posts.isMain(data.post.pid);
  if (isMain) return; // Bunu TopicCreate zaten yakalıyor

  await awardDailyAction(data.post.uid, 'reply');
};

// 4. BEĞENİ (Like Atma ve Alma) - Spam Korumalı
Plugin.onUpvote = async function (data) {
  // data = { post: { pid, uid, ... }, uid: <like atan>, ... }
  const pid = data.post && data.post.pid;
  if (!pid) return;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Like Atan Kazanır:
  if (data.uid) {
    // Bu postu bugün zaten beğenmiş mi?
    const likeGivenKey = `niki:liked:${data.uid}:${today}`;
    const alreadyLiked = await db.isSetMember(likeGivenKey, pid.toString());

    if (!alreadyLiked) {
      await awardDailyAction(data.uid, 'like_given');
      await db.setAdd(likeGivenKey, pid.toString());
      // 24 saat sonra expire olsun
      await db.expire(likeGivenKey, 86400);
    }
  }

  // Like Alan Kazanır (Post sahibi):
  if (data.post && data.post.uid && data.post.uid !== data.uid) {
    // Bu post için bugün zaten puan almış mı?
    const likeTakenKey = `niki:liked_taken:${data.post.uid}:${today}`;
    const alreadyTaken = await db.isSetMember(likeTakenKey, pid.toString());

    if (!alreadyTaken) {
      await awardDailyAction(data.post.uid, 'like_taken');
      await db.setAdd(likeTakenKey, pid.toString());
      await db.expire(likeTakenKey, 86400);
    }
  }
};


// =========================
// 🚀 INIT & ROUTES
// =========================
Plugin.init = async function (params) {
  const router = params.router;
  const middleware = params.middleware;

  // 1) HEARTBEAT (Artık "Okuma" Puanı veriyor)
  // Client-side script her 30-60 saniyede bir bu adrese istek atmalıdır.
  router.post('/api/niki-loyalty/heartbeat', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      // Heartbeat geldiğinde "read" aksiyonunu tetikle
      await awardDailyAction(uid, 'read');

      const newBalance = await user.getUserField(uid, 'niki_points');
      return res.json({ earned: true, total: newBalance });
    } catch (err) {
      return res.status(500).json({ error: 'error' });
    }
  });

  // 1.5) GÜNLÜK GİRİŞ KONTROLÜ (Session açık olsa bile günlük puan ver)
  // Client sayfa yüklendiğinde bu endpoint'i çağırır
  router.post('/api/niki-loyalty/daily-checkin', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const actionCountKey = `niki:daily:${uid}:${today}:counts`;

      // Bugün login puanı alınmış mı kontrol et
      const loginCount = parseInt((await db.getObjectField(actionCountKey, 'login')) || 0, 10);

      if (loginCount >= 1) {
        // Zaten bugün alınmış
        return res.json({ alreadyClaimed: true, message: 'Günlük giriş puanı zaten alındı.' });
      }

      // Puanı ver
      await awardDailyAction(uid, 'login');

      const newBalance = await user.getUserField(uid, 'niki_points');
      return res.json({ success: true, earned: ACTIONS.login.points, total: newBalance });
    } catch (err) {
      return res.status(500).json({ error: 'error' });
    }
  });

  // 2) WALLET DATA (Cüzdan Bilgileri)
  // 2) WALLET DATA (Sayaçlar Eklendi)
  router.get('/api/niki-loyalty/wallet-data', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      // Veritabanından verileri çek
      const [userData, dailyData, actionCounts, historyRaw] = await Promise.all([
        user.getUserFields(uid, ['niki_points']),
        db.getObject(`niki:daily:${uid}:${today}`),
        db.getObject(`niki:daily:${uid}:${today}:counts`), // <--- YENİ: Sayaçları çekiyoruz
        db.getListRange(`niki:activity:${uid}`, 0, -1),
      ]);

      const dailyScore = parseFloat(dailyData?.score || 0);
      let dailyPercent = (dailyScore / SETTINGS.dailyCap) * 100;
      if (dailyPercent > 100) dailyPercent = 100;

      const history = (historyRaw || []).map(safeParseMaybeJson).filter(Boolean).reverse();

      return res.json({
        points: parseInt(userData?.niki_points || 0, 10),
        dailyScore,
        dailyCap: SETTINGS.dailyCap,
        dailyPercent,
        counts: actionCounts || {}, // <--- YENİ: Frontend'e gönderiyoruz
        history,
        rewards: REWARDS,
      });
    } catch (err) {
      return res.status(500).json({ points: 0, history: [] });
    }
  });

  // 3) KASA HISTORY 
  router.get('/api/niki-loyalty/kasa-history', middleware.ensureLoggedIn, async (req, res) => {
    // ... (Mevcut kodunun aynısı - sadece yetki kontrolü var)
    try {
      const isAdmin = await user.isAdministrator(req.uid);
      const isMod = await user.isGlobalModerator(req.uid);
      if (!isAdmin && !isMod) return res.status(403).json([]);

      const raw = await db.getListRange('niki:kasa:history', 0, -1);
      const rows = (raw || []).map(safeParseMaybeJson).filter(Boolean).reverse();

      // Kullanıcı detaylarını doldurma (Map logic)
      const uids = rows.map(r => parseInt(r.cuid, 10)).filter(n => Number.isFinite(n) && n > 0);
      const users = await user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture', 'icon:bgColor']);
      const userMap = {};
      (users || []).forEach(u => userMap[u.uid] = u);

      const rp = nconf.get('relative_path') || '';
      const enriched = rows.map(r => {
        const u = userMap[r.cuid] || {};
        return {
          ...r,
          cust: u.username || r.cust || 'Bilinmeyen',
          picture: u.picture || '',
          iconBg: u['icon:bgColor'] || '#4b5563',
          profileUrl: u.userslug ? `${rp}/user/${u.userslug}` : '',
          reward: r.reward || 'İşlem'
        };
      });
      return res.json(enriched);
    } catch (e) { return res.status(500).json([]); }
  });

  // 4) QR OLUŞTURMA
  router.post('/api/niki-loyalty/generate-qr', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      const points = parseFloat((await user.getUserField(uid, 'niki_points')) || 0);
      const minCost = REWARDS[REWARDS.length - 1].cost; // En ucuz ödül

      if (!TEST_MODE_UNLIMITED && points < minCost) {
        return res.json({ success: false, message: `Yetersiz Puan. En az ${minCost} gerekli.` });
      }
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      await db.set(`niki:qr:${token}`, uid);
      await db.expire(`niki:qr:${token}`, 120); // 2 dakika geçerli
      return res.json({ success: true, token });
    } catch (e) { return res.status(500).json({ success: false }); }
  });

  // 5) QR TARATMA (Kasa İşlemi)
  router.post('/api/niki-loyalty/scan-qr', middleware.ensureLoggedIn, async (req, res) => {
    // ... (Mevcut kodunun aynısı)
    try {
      const token = req.body.token;
      const isAdmin = await user.isAdministrator(req.uid);
      const isMod = await user.isGlobalModerator(req.uid);
      if (!isAdmin && !isMod) return res.status(403).json({ success: false, message: 'Yetkisiz' });

      const custUid = await db.get(`niki:qr:${token}`);
      if (!custUid) return res.json({ success: false, message: 'Geçersiz Kod' });

      const pts = parseFloat(await user.getUserField(custUid, 'niki_points') || 0);

      let selectedReward = null;
      if (!TEST_MODE_UNLIMITED) {
        for (const r of REWARDS) {
          if (pts >= r.cost) { selectedReward = r; break; }
        }
        if (!selectedReward) return res.json({ success: false, message: 'Puan Yetersiz' });
      } else { selectedReward = REWARDS[0]; }

      if (!TEST_MODE_UNLIMITED) {
        await user.decrementUserFieldBy(custUid, 'niki_points', selectedReward.cost);
      }
      await db.delete(`niki:qr:${token}`);

      const cData = await user.getUserFields(custUid, ['username', 'picture', 'userslug']);
      await addUserLog(custUid, 'spend', selectedReward.cost, selectedReward.name);
      await addKasaLog(req.uid, cData.username, custUid, selectedReward.name, selectedReward.cost);

      return res.json({ success: true, customer: cData, rewardName: selectedReward.name, cost: selectedReward.cost });
    } catch (e) { return res.status(500).json({ success: false }); }
  });

  // 6) SAYFA ROTALARI
  routeHelpers.setupPageRoute(router, '/niki-kasa', middleware, [], async (req, res) => {
    const isStaff = await user.isAdministrator(req.uid) || await user.isGlobalModerator(req.uid);
    if (!isStaff) return res.render('403', {});
    return res.render('niki-kasa', { title: 'Niki Kasa' });
  });
};

Plugin.addScripts = async function (scripts) {
  scripts.push('plugins/nodebb-plugin-niki-loyalty/static/lib/client.js');
  return scripts;
};

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
