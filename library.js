'use strict';

const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const routeHelpers = require.main.require('./src/controllers/helpers');

const Plugin = {};

const SETTINGS = {
    pointsPerHeartbeat: 5,
    dailyCap: 250,
    coffeeCost: 250
};

Plugin.init = async function (params) {
    const router = params.router;
    const middleware = params.middleware;

    // 1. HEARTBEAT (Puan Kazanma)
    router.post('/api/niki-loyalty/heartbeat', middleware.ensureLoggedIn, async (req, res) => {
        const uid = req.uid;
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const dailyKey = `niki:daily:${uid}:${today}`;
        
        const currentDailyScore = await db.getObjectField(dailyKey, 'score') || 0;

        if (parseInt(currentDailyScore) >= SETTINGS.dailyCap) {
            return res.json({ earned: false, reason: 'daily_cap' });
        }

        await user.incrementUserFieldBy(uid, 'niki_points', SETTINGS.pointsPerHeartbeat);
        await db.incrObjectFieldBy(dailyKey, 'score', SETTINGS.pointsPerHeartbeat);

        const newBalance = await user.getUserField(uid, 'niki_points');
        return res.json({ earned: true, points: SETTINGS.pointsPerHeartbeat, total: newBalance });
    });

    // 2. WALLET DATA (Bilgi Çekme)
    router.get('/api/niki-loyalty/wallet-data', middleware.ensureLoggedIn, async (req, res) => {
        const uid = req.uid;
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        const [userData, dailyData] = await Promise.all([
            user.getUserFields(uid, ['niki_points']),
            db.getObject(`niki:daily:${uid}:${today}`)
        ]);

        const currentPoints = parseInt(userData.niki_points) || 0;
        const dailyScore = parseInt(dailyData ? dailyData.score : 0) || 0;
        let dailyPercent = (dailyScore / SETTINGS.dailyCap) * 100;
        if (dailyPercent > 100) dailyPercent = 100;

        res.json({
            points: currentPoints,
            dailyScore: dailyScore,
            dailyCap: SETTINGS.dailyCap,
            dailyPercent: dailyPercent
        });
    });

    // 3. QR TOKEN ÜRET (Öğrenci Butona Basınca)
    router.post('/api/niki-loyalty/generate-qr', middleware.ensureLoggedIn, async (req, res) => {
        const uid = req.uid;
        const points = parseInt(await user.getUserField(uid, 'niki_points')) || 0;
        
        if (points < SETTINGS.coffeeCost) {
            return res.json({ success: false, message: 'Yetersiz Puan' });
        }

        // Token Oluştur
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        
        // Kaydet (2 dakika geçerli)
        await db.set(`niki:qr:${token}`, uid);
        await db.expire(`niki:qr:${token}`, 120);

        return res.json({ success: true, token: token });
    });

    // 4. QR OKUTMA (Personel Tarayınca)
    router.post('/api/niki-loyalty/scan-qr', middleware.ensureLoggedIn, async (req, res) => {
        const { token } = req.body;
        
        // Sadece Admin/Mod yetkisi
        const isAdmin = await user.isAdministrator(req.uid);
        const isMod = await user.isGlobalModerator(req.uid);
        if (!isAdmin && !isMod) return res.status(403).json({ success: false, message: 'Yetkisiz' });

        const customerUid = await db.get(`niki:qr:${token}`);
        if (!customerUid) return res.json({ success: false, message: 'Geçersiz Kod' });

        // Puan Düş
        const pts = parseInt(await user.getUserField(customerUid, 'niki_points')) || 0;
        if (pts < SETTINGS.coffeeCost) return res.json({ success: false, message: 'Bakiye Yetersiz' });

        await user.decrementUserFieldBy(customerUid, 'niki_points', SETTINGS.coffeeCost);
        await db.delete(`niki:qr:${token}`);

        const customerData = await user.getUserFields(customerUid, ['username', 'picture']);
        return res.json({ success: true, customer: customerData, message: 'Onaylandı!' });
    });

    // 5. NIKI KASA SAYFASI (Erişim Kontrolü)
    routeHelpers.setupPageRoute(router, '/niki-kasa', middleware, [], async (req, res) => {
        const isAdmin = await user.isAdministrator(req.uid);
        const isMod = await user.isGlobalModerator(req.uid);
        if (!isAdmin && !isMod) return res.render('403', {});
        res.render('niki-kasa', { title: 'Niki Kasa' });
    });
};

Plugin.addScripts = async function (scripts) {
    scripts.push('plugins/nodebb-plugin-niki-loyalty/static/lib/client.js');
    return scripts;
};

Plugin.addNavigation = async function (nav) {
    nav.push({ route: "/niki-wallet", title: "Niki Cüzdan", enabled: true, iconClass: "fa-coffee", text: "Niki Cüzdan" });
    return nav;
};

module.exports = Plugin;