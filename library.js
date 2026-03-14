const crypto = require('crypto');
const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const posts = require.main.require('./src/posts');
const routeHelpers = require.main.require('./src/controllers/helpers');
const nconf = require.main.require('nconf');
const meta = require.main.require('./src/meta');
const socketHelpers = require.main.require('./src/socket.io/index');
const SocketPlugins = require.main.require('./src/socket.io/plugins');
const groups = require.main.require('./src/groups');
const Plugin = {};

// Ödül kullanabilecek gruplar
const WALLET_GROUPS = ['Premium', 'Lite', 'VIP'];

// =========================
// ⚙️ AYARLAR & KURALLAR (GAME LOGIC)
// =========================
const SETTINGS = {
  dailyCap: 35, // Günlük Maksimum Limit
};

// Puan Tablosu ve Limitleri (Toplam Potansiyel ~45 Puan)
const ACTIONS = {
  login: { points: 5, limit: 1, name: 'Günlük Giriş 👋' },           // 5 Puan
  new_topic: { points: 5, limit: 1, name: 'Yeni Konu 📝' },          // 5 Puan
  reply: { points: 5, limit: 2, name: 'Yorum Yazma 💬' },            // 5 x 2 = 10 Puan
  read: { points: 1, limit: 10, name: 'Konu Okuma 👀' },             // 1 x 10 = 10 Puan
  like_given: { points: 2.5, limit: 2, name: 'Beğeni Atma ❤️' },     // 2.5 x 2 = 5 Puan
  like_taken: { points: 5, limit: 2, name: 'Beğeni Alma 🌟' }        // 5 x 2 = 10 Puan
};

// Grup Katılım Bonusları
const GROUP_BONUSES = {
  'Premium': 30,
  'VIP': 60,
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
// 📦 AYARLARI DB'DEN YÜKLE
// =========================
async function loadAndApplySettings() {
  try {
    const saved = await new Promise((resolve) => {
      meta.settings.get('niki-loyalty', (err, settings) => {
        resolve(err ? {} : (settings || {}));
      });
    });

    if (!saved || Object.keys(saved).length === 0) return;

    // Genel
    if (saved.dailyCap) SETTINGS.dailyCap = parseInt(saved.dailyCap, 10) || SETTINGS.dailyCap;

    // Aksiyonlar
    ['login', 'new_topic', 'reply', 'read', 'like_given', 'like_taken'].forEach(key => {
      if (saved[key + '_points'] !== undefined && saved[key + '_points'] !== '')
        ACTIONS[key].points = parseFloat(saved[key + '_points']);
      if (saved[key + '_limit'] !== undefined && saved[key + '_limit'] !== '')
        ACTIONS[key].limit = parseInt(saved[key + '_limit'], 10);
    });

    // Ödüller
    for (let i = 0; i < REWARDS.length; i++) {
      if (saved['reward' + i + '_name']) REWARDS[i].name = saved['reward' + i + '_name'];
      if (saved['reward' + i + '_cost'] !== undefined && saved['reward' + i + '_cost'] !== '')
        REWARDS[i].cost = parseInt(saved['reward' + i + '_cost'], 10);
    }

    // Grup Bonusları
    if (saved.bonus_premium !== undefined && saved.bonus_premium !== '')
      GROUP_BONUSES['Premium'] = parseInt(saved.bonus_premium, 10);
    if (saved.bonus_vip !== undefined && saved.bonus_vip !== '')
      GROUP_BONUSES['VIP'] = parseInt(saved.bonus_vip, 10);

  } catch (err) {
    console.error('[NIKI] Ayarlar yüklenirken hata:', err);
  }
}

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
async function awardDailyAction(uid, actionKey) {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rule = ACTIONS[actionKey];

    if (!rule) {

      return { success: false, reason: 'unknown_action' };
    }

    // 1. Genel Günlük Limit Kontrolü
    const dailyScoreKey = `niki:daily:${uid}:${today}`;
    const currentDailyScore = parseFloat((await db.getObjectField(dailyScoreKey, 'score')) || 0);
    if (currentDailyScore >= SETTINGS.dailyCap) {

      return { success: false, reason: 'daily_cap_reached' };
    }

    // 2. Eylem Bazlı Limit Kontrolü
    const actionCountKey = `niki:daily:${uid}:${today}:counts`;
    const currentActionCount = parseInt((await db.getObjectField(actionCountKey, actionKey)) || 0, 10);
    if (currentActionCount >= rule.limit) {

      return { success: false, reason: 'action_limit_reached' };
    }

    // 3. Puan Hesapla
    let pointsToGive = rule.points;
    if (currentDailyScore + pointsToGive > SETTINGS.dailyCap) {
      pointsToGive = SETTINGS.dailyCap - currentDailyScore;
    }
    if (pointsToGive <= 0) {
      return { success: false, reason: 'no_points_to_give' };
    }

    // 4. DB Güncellemeleri
    await user.incrementUserFieldBy(uid, 'niki_points', pointsToGive);
    await db.incrObjectFieldBy(dailyScoreKey, 'score', pointsToGive);
    await db.incrObjectFieldBy(actionCountKey, actionKey, 1);

    // Günlük anahtarlara TTL koy (48 saat) - eski anahtarların birikmesini önle
    await db.expire(dailyScoreKey, 172800);
    await db.expire(actionCountKey, 172800);

    // Logla
    await addUserLog(uid, 'earn', pointsToGive, rule.name);

    // Kullanıcıya Bildirim Gönder (Socket Emit)
    try {
      if (socketHelpers && socketHelpers.server && socketHelpers.server.sockets) {
        const newTotal = parseFloat((await user.getUserField(uid, 'niki_points')) || 0);
        socketHelpers.server.sockets.in('uid_' + uid).emit('event:niki_award', {
          title: 'Tebrikler! 🥳',
          message: `${rule.name} işleminden <strong style="color:#ffd700">+${pointsToGive} Puan</strong> kazandın!`,
          newTotal: newTotal
        });
      }
    } catch (socketErr) {
    }

    return { success: true, points: pointsToGive };

  } catch (err) {

    return { success: false, reason: 'error', error: err.message };
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

// 4. BEĞENİ (Like Atma ve Alma) - Spam Korumalı + Debug Loglı
// NodeBB upvote hook'u { pid, uid, ... } formatında data gönderir (post nesnesi değil!)
Plugin.onUpvote = async function (data) {
  const pid = data.pid || (data.post && data.post.pid);
  const voterUid = data.uid || (data.current && data.current.uid);

  if (!pid || !voterUid) return;

  let postOwnerUid;
  try {
    postOwnerUid = await posts.getPostField(pid, 'uid');
  } catch (err) {
    return;
  }
  if (!postOwnerUid) return;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Like Atan Kazanır
  const likeGivenKey = `niki:liked:${voterUid}:${today}`;
  const alreadyLiked = await db.isSetMember(likeGivenKey, pid.toString());

  if (!alreadyLiked) {
    await awardDailyAction(voterUid, 'like_given');
    await db.setAdd(likeGivenKey, pid.toString());
    await db.expire(likeGivenKey, 86400);
  }

  // Like Alan Kazanır (kendine beğeni atamaz)
  if (postOwnerUid && String(postOwnerUid) !== String(voterUid)) {
    const likeTakenKey = `niki:liked_taken:${postOwnerUid}:${today}`;
    const alreadyTaken = await db.isSetMember(likeTakenKey, pid.toString());

    if (!alreadyTaken) {
      await awardDailyAction(postOwnerUid, 'like_taken');
      await db.setAdd(likeTakenKey, pid.toString());
      await db.expire(likeTakenKey, 86400);
    }
  }
};


// 5. GRUP KATILIM BONUSU (Premium / VIP)
Plugin.onGroupJoin = async function (data) {
  try {
    if (!data) return;

    // NodeBB sürümüne göre groupName string veya array gelebilir
    const groupNames = Array.isArray(data.groupName) ? data.groupName
      : data.groupNames ? (Array.isArray(data.groupNames) ? data.groupNames : [data.groupNames])
      : data.groupName ? [data.groupName]
      : [];

    // uid tek veya array olabilir (ACP toplu ekleme)
    const uids = Array.isArray(data.uid) ? data.uid : data.uid ? [data.uid] : [];

    for (const rawGroupName of groupNames) {
      if (!rawGroupName) continue;

      // Grup adını GROUP_BONUSES'da bul (case-insensitive)
      let matchedGroup = null;
      let bonus = 0;
      for (const key of Object.keys(GROUP_BONUSES)) {
        if (key.toLowerCase() === String(rawGroupName).toLowerCase()) {
          matchedGroup = key;
          bonus = GROUP_BONUSES[key];
          break;
        }
      }
      if (!matchedGroup || !bonus) continue;

      for (const uid of uids) {
        if (!uid) continue;

        await user.incrementUserFieldBy(uid, 'niki_points', bonus);
        await addUserLog(uid, 'earn', bonus, `${matchedGroup} Grubu Katılım Bonusu 🎉`);

        try {
          if (socketHelpers && socketHelpers.server && socketHelpers.server.sockets) {
            socketHelpers.server.sockets.in('uid_' + uid).emit('event:niki_award', {
              title: 'Grup Bonusu! 🎉',
              message: `${matchedGroup} grubuna katıldığın için <strong style="color:#ffd700">+${bonus} Puan</strong> kazandın!`,
            });
          }
        } catch (socketErr) {
        }
      }
    }
  } catch (err) {
  }
};

// =========================
// 🚀 INIT & ROUTES
// =========================
Plugin.init = async function (params) {
  const router = params.router;
  const middleware = params.middleware;

  // DB'den ayarları yükle
  await loadAndApplySettings();

  // ADMIN PANEL ROTALARI
  function renderAdmin(req, res) {
    res.render('admin/plugins/niki-loyalty', { title: 'Niki Loyalty Ayarları' });
  }
  router.get('/admin/plugins/niki-loyalty', middleware.admin.buildHeader, renderAdmin);
  router.get('/api/admin/plugins/niki-loyalty', renderAdmin);

  // 1) HEARTBEAT (Artık "Okuma" Puanı veriyor)
  // Client-side script her 30-60 saniyede bir bu adrese istek atmalıdır.
  router.post('/api/niki-loyalty/heartbeat', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      // Heartbeat geldiğinde "read" aksiyonunu tetikle
      const result = await awardDailyAction(uid, 'read');

      const newBalance = await user.getUserField(uid, 'niki_points');
      return res.json({ earned: result.success, total: newBalance });
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

  // 2) WALLET DATA (Cüzdan Bilgileri + Sayaçlar)
  router.get('/api/niki-loyalty/wallet-data', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      // Veritabanından verileri çek
      const [userData, dailyData, actionCounts, historyRaw, memberChecks] = await Promise.all([
        user.getUserFields(uid, ['niki_points']),
        db.getObject(`niki:daily:${uid}:${today}`),
        db.getObject(`niki:daily:${uid}:${today}:counts`),
        db.getListRange(`niki:activity:${uid}`, 0, -1),
        Promise.all(WALLET_GROUPS.map(g => groups.isMember(uid, g))),
      ]);

      // Kullanıcı WALLET_GROUPS'dan herhangi birinde mi?
      const canRedeem = memberChecks.some(Boolean);
      const userGroup = canRedeem ? WALLET_GROUPS[memberChecks.indexOf(true)] : null;

      const dailyScore = parseFloat(dailyData?.score || 0);
      let dailyPercent = (dailyScore / SETTINGS.dailyCap) * 100;
      if (dailyPercent > 100) dailyPercent = 100;

      const history = (historyRaw || []).map(safeParseMaybeJson).filter(Boolean).reverse();

      return res.json({
        points: parseInt(userData?.niki_points || 0, 10),
        dailyScore,
        dailyCap: SETTINGS.dailyCap,
        dailyPercent,
        counts: actionCounts || {},
        actions: ACTIONS,
        history,
        rewards: REWARDS,
        canRedeem,
        userGroup,
        walletGroups: WALLET_GROUPS,
      });
    } catch (err) {
      return res.status(500).json({ points: 0, history: [] });
    }
  });

  // 3) KASA HISTORY - GELİŞMİŞ VERSİYON (Filtre + İstatistik)
  router.get('/api/niki-loyalty/kasa-history', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const isAdmin = await user.isAdministrator(req.uid);
      const isMod = await user.isGlobalModerator(req.uid);
      if (!isAdmin && !isMod) return res.status(403).json({ error: 'Yetkisiz' });

      // Query parametreleri
      const { startDate, endDate, search, rewardType, exportAll } = req.query;

      const raw = await db.getListRange('niki:kasa:history', 0, -1);
      let rows = (raw || []).map(safeParseMaybeJson).filter(Boolean).reverse();

      // Personel bilgilerini de al
      const staffUids = [...new Set(rows.map(r => parseInt(r.staff, 10)).filter(n => Number.isFinite(n) && n > 0))];
      const custUids = rows.map(r => parseInt(r.cuid, 10)).filter(n => Number.isFinite(n) && n > 0);
      const allUids = [...new Set([...staffUids, ...custUids])];

      const usersData = await user.getUsersFields(allUids, ['uid', 'username', 'userslug', 'picture', 'icon:bgColor']);
      const userMap = {};
      (usersData || []).forEach(u => userMap[u.uid] = u);

      const rp = nconf.get('relative_path') || '';

      // Zenginleştir
      let enriched = rows.map(r => {
        const custUser = userMap[r.cuid] || {};
        const staffUser = userMap[r.staff] || {};
        return {
          ...r,
          cust: custUser.username || r.cust || 'Bilinmeyen',
          picture: custUser.picture || '',
          iconBg: custUser['icon:bgColor'] || '#4b5563',
          profileUrl: custUser.userslug ? `${rp}/user/${custUser.userslug}` : '',
          reward: r.reward || 'İşlem',
          staffName: staffUser.username || 'Personel',
          staffPicture: staffUser.picture || '',
          date: new Date(r.ts).toISOString().slice(0, 10) // YYYY-MM-DD
        };
      });

      // FİLTRELEME
      // 1. Tarih aralığı
      if (startDate) {
        const start = new Date(startDate).getTime();
        enriched = enriched.filter(r => r.ts >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime() + 86400000; // gün sonu
        enriched = enriched.filter(r => r.ts < end);
      }

      // 2. Arama (kullanıcı adı)
      if (search && search.trim()) {
        const q = search.toLowerCase().trim();
        enriched = enriched.filter(r =>
          (r.cust && r.cust.toLowerCase().includes(q)) ||
          (r.staffName && r.staffName.toLowerCase().includes(q))
        );
      }

      // 3. Ödül tipi
      if (rewardType && rewardType !== 'all') {
        enriched = enriched.filter(r => r.reward === rewardType);
      }

      // İSTATİSTİKLER
      const stats = {
        totalTransactions: enriched.length,
        totalPoints: enriched.reduce((sum, r) => sum + (parseFloat(r.amt) || 0), 0),
        byReward: {},
        byStaff: {},
        byDate: {}
      };

      enriched.forEach(r => {
        // Ödül bazında
        stats.byReward[r.reward] = (stats.byReward[r.reward] || 0) + 1;
        // Personel bazında
        stats.byStaff[r.staffName] = (stats.byStaff[r.staffName] || 0) + 1;
        // Gün bazında (son 7 gün için chart)
        stats.byDate[r.date] = (stats.byDate[r.date] || 0) + 1;
      });

      // Benzersiz ödül tipleri (filter dropdown için)
      const rewardTypes = [...new Set(rows.map(r => r.reward || 'İşlem'))];

      // Export all için sayfalama yok
      if (exportAll === 'true') {
        return res.json({
          data: enriched,
          stats,
          rewardTypes
        });
      }

      // Normal görünüm (son 100 işlem)
      return res.json({
        data: enriched.slice(0, 100),
        stats,
        rewardTypes,
        hasMore: enriched.length > 100
      });
    } catch (e) {
      return res.status(500).json({ error: 'Sunucu hatası' });
    }
  });

  // 4) QR OLUŞTURMA
  router.post('/api/niki-loyalty/generate-qr', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const uid = req.uid;

      // Grup kontrolü
      const memberChecks = await Promise.all(WALLET_GROUPS.map(g => groups.isMember(uid, g)));
      if (!memberChecks.some(Boolean)) {
        return res.json({ success: false, message: 'Ödül kullanmak için Premium, Lite veya VIP grubuna katılmalısın.' });
      }

      const rewardIndex = parseInt(req.body.rewardIndex, 10);
      const points = parseFloat((await user.getUserField(uid, 'niki_points')) || 0);

      // Seçilen ödülü bul
      if (isNaN(rewardIndex) || rewardIndex < 0 || rewardIndex >= REWARDS.length) {
        return res.json({ success: false, message: 'Geçersiz ödül seçimi.' });
      }
      const selectedReward = REWARDS[rewardIndex];

      if (!TEST_MODE_UNLIMITED && points < selectedReward.cost) {
        return res.json({ success: false, message: `Yetersiz Puan. ${selectedReward.name} için ${selectedReward.cost} puan gerekli.` });
      }
      const token = crypto.randomBytes(16).toString('hex');
      // Token'a kullanıcı ve seçilen ödül bilgisini kaydet
      await db.setObject(`niki:qr:${token}`, { uid: String(uid), rewardIndex: String(rewardIndex) });
      await db.expire(`niki:qr:${token}`, 120); // 2 dakika geçerli
      return res.json({ success: true, token, rewardName: selectedReward.name, rewardCost: selectedReward.cost });
    } catch (e) { return res.status(500).json({ success: false }); }
  });

  // 5) QR TARATMA (Kasa İşlemi)
  router.post('/api/niki-loyalty/scan-qr', middleware.ensureLoggedIn, async (req, res) => {
    try {
      const token = req.body.token;
      const isAdmin = await user.isAdministrator(req.uid);
      const isMod = await user.isGlobalModerator(req.uid);
      if (!isAdmin && !isMod) return res.status(403).json({ success: false, message: 'Yetkisiz' });

      const qrData = await db.getObject(`niki:qr:${token}`);
      if (!qrData || !qrData.uid) return res.json({ success: false, message: 'Geçersiz Kod' });

      const custUid = qrData.uid;
      const rewardIndex = parseInt(qrData.rewardIndex, 10);
      const pts = parseFloat(await user.getUserField(custUid, 'niki_points') || 0);

      let selectedReward = null;
      if (!TEST_MODE_UNLIMITED) {
        // Token'daki ödül index'ini kullan
        if (!isNaN(rewardIndex) && rewardIndex >= 0 && rewardIndex < REWARDS.length) {
          selectedReward = REWARDS[rewardIndex];
        } else {
          // Fallback: en yüksek ödülü seç
          for (const r of REWARDS) {
            if (pts >= r.cost) { selectedReward = r; break; }
          }
        }
        if (!selectedReward) return res.json({ success: false, message: 'Puan Yetersiz' });
      } else { selectedReward = REWARDS[0]; }

      if (!TEST_MODE_UNLIMITED) {
        if (pts < selectedReward.cost) {
          await db.delete(`niki:qr:${token}`);
          return res.json({ success: false, message: 'Puan yetersiz, işlem iptal edildi.' });
        }
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
    if (!isStaff) return routeHelpers.notAllowed(req, res);
    return res.render('niki-kasa', { title: 'Niki Kasa' });
  });


};

Plugin.addScripts = async function (scripts) {
  scripts.push('plugins/nodebb-plugin-niki-loyalty/static/lib/client.js');
  return scripts;
};

Plugin.addAdminNavigation = async function (header) {
  header.plugins.push({
    route: '/plugins/niki-loyalty',
    icon: 'fa-coffee',
    name: 'Niki Loyalty',
  });
  return header;
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

// =========================
// 🔌 SOCKET IO FONKSİYONLARI
// =========================
Plugin.adminGetUsers = async function (socket, data) {
  try {
    // Yetki Kontrolü
    const uid = socket.uid;
    if (!uid) throw new Error('Giriş yapmalısınız.');

    const isAdmin = await user.isAdministrator(uid);
    const isMod = await user.isGlobalModerator(uid);

    if (!isAdmin && !isMod) throw new Error('Yetkisiz Erişim');

    // TÜM kullanıcıları al (limit yok: -1)
    const uids = await db.getSortedSetRevRange('users:joindate', 0, -1);

    if (!uids || uids.length === 0) return [];

    // Kullanıcı bilgilerini al
    const usersData = await user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture', 'niki_points', 'icon:bgColor']);

    // Puanları işle ve sırala (puanı yüksek olan önce)
    const result = usersData
      .filter(u => u && u.uid) // Geçersiz kayıtları filtrele
      .map(u => ({
        uid: u.uid,
        username: u.username || 'Bilinmeyen',
        userslug: u.userslug || '',
        picture: u.picture || '',
        iconBg: u['icon:bgColor'] || '#4b5563',
        points: parseFloat(u.niki_points || 0)
      }))
      .sort((a, b) => b.points - a.points); // Yüksekten düşüğe sırala

    return result;
  } catch (err) {
    throw err;
  }
};



// =========================
// 🔌 YENİ SOCKET FONKSİYONLARI (POS & ADMIN)
// =========================

// 1) QR SCAN (Socket Versiyonu)
Plugin.socketScanQR = async function (socket, data) {
  const uid = socket.uid;
  if (!uid) throw new Error('Giriş yapmalısınız.');

  const isAdmin = await user.isAdministrator(uid);
  const isMod = await user.isGlobalModerator(uid);
  if (!isAdmin && !isMod) throw new Error('Yetkisiz Erişim');

  const token = data.token;
  if (!token) throw new Error('Geçersiz Token');

  const qrData = await db.getObject(`niki:qr:${token}`);
  if (!qrData || !qrData.uid) throw new Error('QR Kod Geçersiz veya Süresi Dolmuş');

  const custUid = qrData.uid;
  const rewardIndex = parseInt(qrData.rewardIndex, 10);
  const pts = parseFloat((await user.getUserField(custUid, 'niki_points')) || 0);

  let selectedReward = null;
  if (!TEST_MODE_UNLIMITED) {
    if (!isNaN(rewardIndex) && rewardIndex >= 0 && rewardIndex < REWARDS.length) {
      selectedReward = REWARDS[rewardIndex];
    } else {
      for (const r of REWARDS) {
        if (pts >= r.cost) { selectedReward = r; break; }
      }
    }
    if (!selectedReward) throw new Error('Puan Yetersiz');
  } else { selectedReward = REWARDS[0]; }

  if (!TEST_MODE_UNLIMITED) {
    const currentPts = parseFloat(await user.getUserField(custUid, 'niki_points') || 0);
    if (currentPts < selectedReward.cost) {
      await db.delete(`niki:qr:${token}`);
      throw new Error('Puan yetersiz, işlem iptal edildi.');
    }
    await user.decrementUserFieldBy(custUid, 'niki_points', selectedReward.cost);
  }
  await db.delete(`niki:qr:${token}`);

  const cData = await user.getUserFields(custUid, ['username', 'picture', 'userslug']);
  await addUserLog(custUid, 'spend', selectedReward.cost, selectedReward.name);
  await addKasaLog(uid, cData.username, custUid, selectedReward.name, selectedReward.cost);

  return { success: true, customer: cData, rewardName: selectedReward.name, cost: selectedReward.cost };
};

// 2) KASA HISTORY (Socket Versiyonu)
Plugin.socketKasaHistory = async function (socket, data) {
  const uid = socket.uid;
  if (!uid) throw new Error('Giriş yapmalısınız.');

  const isAdmin = await user.isAdministrator(uid);
  const isMod = await user.isGlobalModerator(uid);
  if (!isAdmin && !isMod) throw new Error('Yetkisiz Erişim');

  const raw = await db.getListRange('niki:kasa:history', 0, -1);
  const rows = (raw || []).map(safeParseMaybeJson).filter(Boolean).reverse();

  const uids = rows.map(r => parseInt(r.cuid, 10)).filter(n => Number.isFinite(n) && n > 0);
  const users = await user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture', 'icon:bgColor']);
  const userMap = {};
  (users || []).forEach(u => userMap[u.uid] = u);

  const rp = nconf.get('relative_path') || '';
  return rows.map(r => {
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
};

// 3) MANUEL PUAN YÖNETİMİ (Güvenli)
Plugin.adminManagePoints = async function (socket, data) {
  // data = { targetUid, action: 'add'|'remove', amount, reason }
  const uid = socket.uid;
  if (!uid) throw new Error('Giriş yapmalısınız.');

  // KESİN YETKİ KONTROLÜ (Sadece Administrator)
  const isAdmin = await user.isAdministrator(uid);
  if (!isAdmin) {
    console.warn(`[NIKI SECURITY] Yetkisiz puan değiştirme denemesi! Actor: ${uid}`);
    throw new Error('BU İŞLEM İÇİN YETKİNİZ YOK! (Olay Loglandı)');
  }

  const targetUid = data.targetUid;
  const amount = Math.abs(parseFloat(data.amount));
  const action = data.action;
  const reason = data.reason || 'Manuel Düzenleme';

  if (!targetUid || !amount || amount <= 0) throw new Error('Geçersiz veri.');

  const exists = await user.exists(targetUid);
  if (!exists) throw new Error('Kullanıcı bulunamadı.');

  if (action === 'add') {
    await user.incrementUserFieldBy(targetUid, 'niki_points', amount);
  } else if (action === 'remove') {
    // Negatif bakiye kontrolü
    const currentPts = parseFloat(await user.getUserField(targetUid, 'niki_points') || 0);
    const deduction = Math.min(amount, currentPts);
    if (deduction > 0) {
      await user.decrementUserFieldBy(targetUid, 'niki_points', deduction);
    }
  } else {
    throw new Error('Geçersiz işlem türü.');
  }

  // GÜVENLİK LOGU
  const adminUserData = await user.getUserFields(uid, ['username']);
  const logMsg = `Admin (${adminUserData.username}) tarafından ${action === 'add' ? '+' : '-'}${amount} puan. Sebep: ${reason}`;

  // Negatif amount ile logla, böylece frontend doğru gösterebilir
  const logAmount = action === 'remove' ? -amount : amount;
  await addUserLog(targetUid, 'admin_adjust', logAmount, logMsg);

  // Denetim Logu
  const auditLog = { ts: Date.now(), adminUid: uid, adminName: adminUserData.username, targetUid: targetUid, action: action, amount: amount, reason: reason };
  await db.listAppend('niki:audit:admin_points', JSON.stringify(auditLog));
  await db.listTrim('niki:audit:admin_points', -500, -1);

  const newPoints = await user.getUserField(targetUid, 'niki_points');
  return { success: true, newPoints: parseFloat(newPoints) };
};
// 4) KULLANICI DETAY (Admin için)
Plugin.adminGetUserDetail = async function (socket, data) {
  const uid = socket.uid;
  if (!uid) throw new Error('Giriş yapmalısınız.');

  const isAdmin = await user.isAdministrator(uid);
  const isMod = await user.isGlobalModerator(uid);
  if (!isAdmin && !isMod) throw new Error('Yetkisiz Erişim');

  const targetUid = data.uid;
  if (!targetUid) throw new Error('Kullanıcı ID gerekli.');

  // Kullanıcı bilgileri
  const userData = await user.getUserFields(targetUid, [
    'uid', 'username', 'userslug', 'picture', 'email',
    'niki_points', 'icon:bgColor', 'joindate', 'lastonline'
  ]);

  if (!userData || !userData.uid) throw new Error('Kullanıcı bulunamadı.');

  // Aktivite geçmişi
  const activityRaw = await db.getListRange(`niki:activity:${targetUid}`, 0, -1);
  const activities = (activityRaw || []).map(safeParseMaybeJson).filter(Boolean).reverse();

  // Kazanılan ve harcanan puanları ayır
  let totalEarned = 0;
  let totalSpent = 0;
  const earnHistory = [];
  const spendHistory = [];

  activities.forEach(a => {
    const amt = parseFloat(a.amt) || 0;
    if (a.type === 'admin_adjust') {
      // amt negatifse çıkarma, pozitifse ekleme (eski kayıtlarda text'e bakarak fallback)
      const isDeduction = amt < 0 || (amt > 0 && a.txt && a.txt.includes('-'));
      if (isDeduction) {
        totalSpent += Math.abs(amt);
        spendHistory.push(a);
      } else {
        totalEarned += amt;
        earnHistory.push(a);
      }
    } else if (a.type === 'earn') {
      totalEarned += amt;
      earnHistory.push(a);
    } else if (a.type === 'spend') {
      totalSpent += Math.abs(amt);
      spendHistory.push(a);
    }
  });

  // Günlük limit durumu
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dailyData = await db.getObject(`niki:daily:${targetUid}:${today}`);
  const actionCounts = await db.getObject(`niki:daily:${targetUid}:${today}:counts`);

  // Bu kullanıcının kasa işlemleri (harcamaları)
  const kasaRaw = await db.getListRange('niki:kasa:history', 0, -1);
  const userKasaHistory = (kasaRaw || [])
    .map(safeParseMaybeJson)
    .filter(k => k && String(k.cuid) === String(targetUid))
    .reverse()
    .slice(0, 20);

  const rp = require.main.require('nconf').get('relative_path') || '';

  return {
    user: {
      uid: userData.uid,
      username: userData.username,
      userslug: userData.userslug,
      picture: userData.picture || '',
      email: userData.email || '',
      iconBg: userData['icon:bgColor'] || '#4b5563',
      points: parseFloat(userData.niki_points || 0),
      joindate: userData.joindate,
      lastonline: userData.lastonline,
      profileUrl: userData.userslug ? `${rp}/user/${userData.userslug}` : ''
    },
    stats: {
      totalEarned,
      totalSpent,
      currentPoints: parseFloat(userData.niki_points || 0),
      todayScore: parseFloat((dailyData && dailyData.score) || 0),
      todayCounts: actionCounts || {},
      dailyCap: SETTINGS.dailyCap
    },
    earnHistory: earnHistory.slice(0, 30),
    spendHistory: spendHistory.slice(0, 30),
    kasaHistory: userKasaHistory,
    actions: ACTIONS
  };
};

// 5) GENEL İSTATİSTİKLER (Dashboard için)
Plugin.adminGetStats = async function (socket, data) {
  const uid = socket.uid;
  if (!uid) throw new Error('Giriş yapmalısınız.');

  const isAdmin = await user.isAdministrator(uid);
  const isMod = await user.isGlobalModerator(uid);
  if (!isAdmin && !isMod) throw new Error('Yetkisiz Erişim');

  // Tüm kullanıcıları al
  const uids = await db.getSortedSetRange('users:joindate', 0, 499);
  if (!uids || uids.length === 0) return { users: 0, totalPoints: 0, avgPoints: 0 };

  const usersData = await user.getUsersFields(uids, ['niki_points']);

  let totalPoints = 0;
  let usersWithPoints = 0;

  usersData.forEach(u => {
    const pts = parseFloat(u.niki_points || 0);
    if (pts > 0) {
      totalPoints += pts;
      usersWithPoints++;
    }
  });

  // Kasa geçmişinden toplam harcama
  const kasaRaw = await db.getListRange('niki:kasa:history', 0, -1);
  const kasaData = (kasaRaw || []).map(safeParseMaybeJson).filter(Boolean);
  const totalRedeemed = kasaData.reduce((sum, k) => sum + (parseFloat(k.amt) || 0), 0);

  // Bugünkü işlemler
  const today = new Date().toISOString().slice(0, 10);
  const todayTransactions = kasaData.filter(k => {
    const d = new Date(k.ts).toISOString().slice(0, 10);
    return d === today;
  }).length;

  return {
    usersWithPoints,
    totalPoints: Math.floor(totalPoints),
    avgPoints: usersWithPoints > 0 ? Math.floor(totalPoints / usersWithPoints) : 0,
    totalRedeemed: Math.floor(totalRedeemed),
    totalTransactions: kasaData.length,
    todayTransactions
  };
};

// 6) AYARLARI YENİDEN YÜKLE (Admin panelden kaydet sonrası)
Plugin.reloadSettings = async function (socket) {
  const uid = socket.uid;
  if (!uid) throw new Error('Giriş yapmalısınız.');
  const isAdmin = await user.isAdministrator(uid);
  if (!isAdmin) throw new Error('Yetkisiz Erişim');
  await loadAndApplySettings();
  return { success: true };
};

// Soket'e kaydet (Client: socket.emit('plugins.niki.getUsers', ...))
if (SocketPlugins) {
  SocketPlugins.niki = {
    getUsers: Plugin.adminGetUsers,
    getUserDetail: Plugin.adminGetUserDetail,
    getStats: Plugin.adminGetStats,
    scanQR: Plugin.socketScanQR,
    getKasaHistory: Plugin.socketKasaHistory,
    managePoints: Plugin.adminManagePoints,
    reloadSettings: Plugin.reloadSettings
  };
}

module.exports = Plugin;
