'use strict';

const db = require.main.require('./src/database');
const user = require.main.require('./src/user');

const Plugin = {};

// --- AYARLAR ---
const SETTINGS = {
    pointsPerHeartbeat: 5,
    dailyCap: 250
};

Plugin.init = async function (params) {
    const router = params.router;
    const middleware = params.middleware;

    // 1. API: Kalp Atışı (Puan Kazanma - Client.js burayı kullanır)
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

    // 2. YENİ API: Cüzdan Verisi Çekme (Custom Page burayı kullanacak)
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
};

Plugin.addScripts = async function (scripts) {
    scripts.push('plugins/nodebb-plugin-niki-loyalty/static/lib/client.js');
    return scripts;
};

// Menüye eklemeye devam edelim, Custom Page ile aynı linki vereceğiz
Plugin.addNavigation = async function (nav) {
    nav.push({
        "route": "/niki-wallet",
        "title": "Niki Cüzdan",
        "enabled": true,
        "iconClass": "fa-coffee",
        "text": "Niki Cüzdan"
    });
    return nav;
};

module.exports = Plugin;