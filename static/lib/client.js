'use strict';

/* globals $, app, socket, ajaxify, utils */

$(document).ready(function () {
    let heartbeatInterval = null;

    // Puanları güzel göstermek için yardımcı fonksiyon (Örn: 10.0 -> 10, 10.5 -> 10.5)
    function formatPoints(points) {
        let val = parseFloat(points);
        if (isNaN(val)) return '0';
        // Eğer tam sayı ise virgülsüz, değilse 1 basamaklı göster
        return Number.isInteger(val) ? val.toFixed(0) : val.toFixed(1);
    }

    // -------------------------------------------------------------
    // 🔔 NİKİ TOAST BİLDİRİM FONKSİYONU (Sol Alt - Inline Stiller)
    // -------------------------------------------------------------
    function showNikiToast(message) {
        // Mevcut toast'ı kaldır
        $('.niki-toast').remove();

        // Logo yolunu al (plugin'in static klasöründen)
        const logoUrl = (config && config.relative_path ? config.relative_path : '') + '/plugins/nodebb-plugin-niki-loyalty/static/logo.png';

        // Toast HTML'i oluştur (Inline stiller ile)
        const toastHtml = `
            <div class="niki-toast" style="
                position: fixed;
                bottom: 90px;
                left: 25px;
                background: linear-gradient(135deg, #4E342E 0%, #3E2723 100%);
                color: #fff;
                padding: 12px 20px;
                border-radius: 16px;
                font-size: 14px;
                font-weight: 600;
                box-shadow: 0 8px 25px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 9999;
                opacity: 0;
                transform: translateY(20px) scale(0.9);
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 1px solid rgba(255,255,255,0.1);
            ">
                <img src="${logoUrl}" alt="Niki" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.2);">
                <span>${message}</span>
            </div>
        `;

        // Body'ye ekle
        $('body').append(toastHtml);

        // Animasyon için kısa gecikme - görünür yap
        setTimeout(function () {
            $('.niki-toast').css({
                'opacity': '1',
                'transform': 'translateY(0) scale(1)'
            });
        }, 50);

        // 4 saniye sonra kaldır
        setTimeout(function () {
            $('.niki-toast').css({
                'opacity': '0',
                'transform': 'translateY(20px) scale(0.9)'
            });
            setTimeout(function () {
                $('.niki-toast').remove();
            }, 400);
        }, 4000);

        // Widget'ı da bounce animasyonu ile canlandır
        const $widget = $('#niki-floating-widget .niki-widget-content');
        if ($widget.length) {
            $widget.css('transform', 'scale(1.1)');
            setTimeout(function () {
                $widget.css('transform', 'scale(1)');
            }, 300);
        }

        console.log('[Niki-Loyalty] Toast gösterildi:', message);
    }

    // Fonksiyonu global yap (Konsoldan test için)
    window.showNikiToast = showNikiToast;

    // -------------------------------------------------------------
    // 🐱 FLOATING WIDGET - DEVRE DIŞI
    // Kullanıcı kendi custom widget'ını (duyuru baloncuklu) kullanıyor
    // Bu nedenle client.js widget'ı oluşturmuyor
    // -------------------------------------------------------------

    // Sadece puan güncelleme fonksiyonu (custom widget için)
    function updateFloatingWidget() {
        // Custom widget'ta puan gösterimi varsa güncelle
        if ($('#widget-user-points').length === 0) return;

        // Kullanıcı giriş yapmamışsa API çağrısı yapma
        if (!app.user || !app.user.uid) return;

        $.get('/api/niki-loyalty/wallet-data', function (data) {
            if (data && typeof data.points !== 'undefined') {
                var points = Math.floor(data.points);
                $('#widget-user-points').text(points);
                console.log('[Niki-Loyalty] Widget puanı güncellendi:', points);
            }
        }).fail(function () {
            console.log('[Niki-Loyalty] Widget puanı yüklenemedi.');
        });
    }

    // Fonksiyonu global yap
    window.updateFloatingWidget = updateFloatingWidget;

    // Sayfa yüklendiğinde sadece mevcut widget'ın puanını güncelle
    setTimeout(function () {
        if (app.user && app.user.uid) {
            updateFloatingWidget();
        }
    }, 1000);

    // Her sayfa değişiminde widget puanını güncelle
    $(window).on('action:ajaxify.end', function () {
        if (app.user && app.user.uid) {
            updateFloatingWidget();
        }
    });

    // -------------------------------------------------------------
    // 🌅 GÜNLÜK GİRİŞ KONTROLÜ (Session açık olsa bile puan ver)
    // -------------------------------------------------------------
    function checkDailyLogin() {
        // Sadece giriş yapmış kullanıcılar için çalış
        if (!app.user || !app.user.uid) return;

        // Bugünün tarihini al (YYYYMMDD formatında)
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const storageKey = 'niki_daily_checkin_' + app.user.uid;

        // LocalStorage'da bugün kontrol edilmiş mi?
        const lastCheckin = localStorage.getItem(storageKey);
        if (lastCheckin === today) {
            // Bugün zaten kontrol edilmiş, tekrar istek atma
            return;
        }

        // Backend'e günlük giriş kontrolü isteği at
        $.post('/api/niki-loyalty/daily-checkin', {}, function (response) {
            if (response && response.success) {
                // Puan kazanıldı! Bildirim göster
                showNikiToast('Günlük giriş için <strong style="color:#ffd700">+2 Puan</strong> kazandın! 👋');
                console.log('[Niki-Loyalty] Günlük giriş puanı alındı. Yeni Toplam:', response.total);

                // Widget'ı güncelle
                if (typeof updateSidebarWidget === 'function') {
                    updateSidebarWidget();
                }
            }
            // Başarılı veya zaten alınmış, bugünü kaydet
            localStorage.setItem(storageKey, today);
        }).fail(function () {
            // Hata durumunda sessizce devam et
            console.log('[Niki-Loyalty] Günlük giriş kontrolü başarısız.');
        });
    }

    // Sayfa ilk yüklendiğinde günlük giriş kontrolü yap
    checkDailyLogin();

    $(window).on('action:ajaxify.end', function (ev, data) {
        // 1. ÖNCEKİ SAYAÇLARI TEMİZLE (Sayfa geçişlerinde üst üste binmesin)
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }

        // ============================================================
        // ❤️ KONU OKUMA (HEARTBEAT) SİSTEMİ
        // ============================================================
        // Sadece 'topic' (konu) sayfasındaysak sayaç çalışsın.
        if (ajaxify.data.template.name === 'topic') {
            console.log('[Niki-Loyalty] Konu sayfası algılandı, sayaç başlatılıyor...');

            // 30 Saniyede bir tetikle (Günde 8 limit var backendde)
            heartbeatInterval = setInterval(function () {
                if (document.hidden) return; // Sekme aktif değilse sayma

                console.log('[Niki-Loyalty] 10dk doldu. Puan isteniyor...');

                $.post('/api/niki-loyalty/heartbeat', {}, function (response) {
                    if (response && response.earned) {
                        // Eğer puan kazandıysa özel Niki bildirimi göster
                        if (typeof showNikiToast === 'function') {
                            showNikiToast('Konu okuduğun için <strong style="color:#ffd700">+1 Puan</strong> kazandın! 🐈');
                        }
                        console.log('[Niki-Loyalty] Heartbeat başarılı. Yeni Puan:', response.total);
                        // Widget'ı hemen güncelle
                        updateSidebarWidget();
                    } else {
                        console.log('[Niki-Loyalty] Puan gelmedi (Günlük okuma limiti dolmuş olabilir).');
                    }
                });
            }, 600000); // 10 Dakika = 600.000 ms
        }

        // ============================================================
        // 💰 CÜZDAN SAYFASI (niki-wallet)
        // ============================================================
        if (data.url === 'niki-wallet') {
            loadWalletData();
        }

        // ============================================================
        // 🏪 KASA SAYFASI (niki-kasa) - Yetkili İçin
        // ============================================================
        if (data.url === 'niki-kasa') {
            loadKasaHistory(); // Geçmişi yükle
            setupKasaScanner(); // QR okutma butonlarını ayarla
        }
    });
    // WIDGET CANLANDIRMA (Sayfa her yüklendiğinde widget varsa güncelle)
    // Bunu client.js'de $(document).ready içine en alta koyabilirsin.

    // --------------------------------------------------------
    // WIDGET GÜNCELLEME (Dinamik Sayaçlı)
    // --------------------------------------------------------
    function updateSidebarWidget() {
        // Herhangi bir widget sayfada yoksa boşa istek atma
        const hasFloatingWidget = $('#niki-floating-widget').length > 0 || $('#widget-user-points').length > 0;
        const hasSidebarWidget = $('#widget-daily-progress').length > 0;

        if (!hasFloatingWidget && !hasSidebarWidget) return;

        $.get('/api/niki-loyalty/wallet-data', function (data) {
            // 1. Ana Puanlar
            $('#widget-user-points').text(Math.floor(data.points));

            // 2. İlerleme Çubuğu
            let percent = data.dailyPercent > 100 ? 100 : data.dailyPercent;
            $('#widget-daily-progress').css('width', percent + '%');

            let dailyScore = parseFloat(data.dailyScore);
            let scoreText = Number.isInteger(dailyScore) ? dailyScore : dailyScore.toFixed(1);
            $('#widget-daily-text').text(scoreText + ' / 35');

            // 3. DETAYLI SAYAÇLAR (Counts)
            const c = data.counts || {}; // Backend'den gelen sayaç objesi

            // Helper: İlerleme Yazdırma Fonksiyonu
            function setProgress(id, current, max, rowId) {
                current = parseInt(current || 0);
                const el = $('#' + id);
                const row = $('#' + rowId);

                if (current >= max) {
                    el.html('<span style="color:#4caf50; font-weight:bold;">Tamamlandı ✅</span>');
                    row.addClass('completed'); // CSS ile silikleştir
                } else {
                    el.text(`${current}/${max} Tamamlandı`);
                    row.removeClass('completed');
                }
            }

            // Tek Tek Güncelle (library.js ACTIONS ile eşleştirildi)
            setProgress('w-count-new_topic', c.new_topic, 1, 'item-new-topic');
            setProgress('w-count-reply', c.reply, 2, 'item-reply');
            setProgress('w-count-read', c.read, 10, 'item-read');

            // Like (Alma ve Atma toplamı 4 limit demiştik, burada basitleştirip toplamı gösteriyoruz)
            // Backend'de like_given ve like_taken ayrı tutuluyor, ikisini toplayalım:
            const totalLike = (parseInt(c.like_given || 0) + parseInt(c.like_taken || 0));
            // Not: Like limiti aslında alma 2 + atma 2 = 4. 
            // Kullanıcıya toplam 4 üzerinden göstermek kafa karıştırmaz.
            setProgress('w-count-like', totalLike, 4, 'item-like');

            // Login (Zaten girmişse 1'dir)
            if (c.login >= 1) {
                $('#w-count-login').html('<span style="color:#4caf50;">Alındı ✅</span>');
                $('#item-login').addClass('completed');
            }
        });
    }

    // --------------------------------------------------------
    // ❤️ KONU OKUMA (DEBUG LOGLU)
    // --------------------------------------------------------
    if (ajaxify.data.template.name === 'topic') {
        // Konsola bilgi yazalım (F12 -> Console'da görebilirsin)
        console.log('[Niki-Loyalty] Konu sayfası! Sayaç başladı. 30sn sonra puan isteği gidecek...');

        heartbeatInterval = setInterval(function () {
            if (document.hidden) return; // Sekme aktif değilse sayma

            console.log('[Niki-Loyalty] 30sn doldu. Puan isteniyor...'); // <--- KONTROL İÇİN

            $.post('/api/niki-loyalty/heartbeat', {}, function (response) {
                if (response && response.earned) {
                    console.log('[Niki-Loyalty] OKUMA PUANI ALINDI! Yeni Toplam:', response.total);
                    // Widget'ı hemen güncelle ki kullanıcı "1/8" olduğunu görsün
                    updateSidebarWidget();
                } else {
                    console.log('[Niki-Loyalty] Puan gelmedi (Limit dolmuş olabilir).');
                }
            });
        }, 30000); // 30 Saniye
    }
    // -------------------------------------------------------------
    // 🔔 PUAN BİLDİRİMİ DİNLEYİCİSİ (SOCKET) - Özel Niki Toast
    // -------------------------------------------------------------
    socket.on('event:niki_award', function (data) {
        // 1. Özel Niki Toast Bildirimi Göster
        const pointsText = data.message || `+${data.points || ''} Puan kazandın!`;
        showNikiToast(pointsText);

        // 2. Eğer Sidebar Widget varsa anlık güncelle (Sayfa yenilemeye gerek kalmasın)
        if (typeof updateSidebarWidget === 'function') {
            updateSidebarWidget();
        }
    });
    // Sayfa değiştiğinde (Ajaxify) widget'ı güncelle
    $(window).on('action:ajaxify.end', function () {
        updateSidebarWidget();
    });

    // İlk açılışta güncelle
    updateSidebarWidget();
    // -------------------------------------------------------------
    // CÜZDAN FONKSİYONLARI
    // -------------------------------------------------------------
    function loadWalletData() {
        $.get('/api/niki-loyalty/wallet-data', function (data) {
            // Puanları yerleştir (Decimal desteği ile)
            $('#user-points').text(formatPoints(data.points));
            $('#daily-score').text(formatPoints(data.dailyScore));
            $('#daily-cap').text(data.dailyCap);

            // Progress Bar
            const percent = data.dailyPercent > 100 ? 100 : data.dailyPercent;
            $('#daily-progress').css('width', percent + '%').text(Math.round(percent) + '%');

            // Geçmiş Tablosu
            const historyList = $('#history-list');
            historyList.empty();

            if (data.history && data.history.length > 0) {
                data.history.forEach(function (item) {
                    const colorClass = item.type === 'earn' ? 'text-success' : 'text-danger';
                    const sign = item.type === 'earn' ? '+' : '-';
                    const dateStr = new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    const html = `
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            <div>
                                <small class="text-muted me-2">${dateStr}</small>
                                <span>${item.txt}</span>
                            </div>
                            <span class="fw-bold ${colorClass}">${sign}${formatPoints(item.amt)}</span>
                        </li>
                    `;
                    historyList.append(html);
                });
            } else {
                historyList.append('<li class="list-group-item text-center text-muted">Henüz işlem yok.</li>');
            }

            // QR Oluştur Butonu
            $('#btn-generate-qr').off('click').on('click', function () {
                $(this).prop('disabled', true);
                $.post('/api/niki-loyalty/generate-qr', {}, function (res) {
                    $('#btn-generate-qr').prop('disabled', false);
                    if (res.success) {
                        // Basit bir modal veya alert ile kodu göster (veya QR kütüphanesi kullan)
                        // Şimdilik token'ı text olarak gösteriyoruz:
                        app.alert({
                            type: 'info',
                            title: 'Kod Oluşturuldu',
                            message: '<div class="text-center">Kasiyere bu kodu göster:<br><h2 style="margin:10px 0; letter-spacing:2px;">' + res.token + '</h2><small>2 dakika geçerli</small></div>',
                            timeout: 10000 // 10 saniye ekranda kalsın
                        });
                    } else {
                        app.alert({ type: 'danger', message: res.message });
                    }
                });
            });
        });
    }

    // -------------------------------------------------------------
    // KASA FONKSİYONLARI (Admin/Mod)
    // -------------------------------------------------------------
    function loadKasaHistory() {
        const tbody = $('#kasa-history-tbody');
        if (tbody.length === 0) return;

        $.get('/api/niki-loyalty/kasa-history', function (rows) {
            tbody.empty();
            if (!rows || rows.length === 0) {
                tbody.append('<tr><td colspan="5" class="text-center">Geçmiş işlem yok.</td></tr>');
                return;
            }
            rows.forEach(r => {
                const dateStr = new Date(r.ts).toLocaleDateString() + ' ' + new Date(r.ts).toLocaleTimeString();
                const rowHtml = `
                    <tr>
                        <td>${dateStr}</td>
                        <td>
                            <a href="${r.profileUrl}" target="_blank" class="text-decoration-none">
                                <span class="avatar avatar-sm" style="background-color: ${r.iconBg};">${r.cust.charAt(0).toUpperCase()}</span>
                                ${r.cust}
                            </a>
                        </td>
                        <td>${r.reward}</td>
                        <td class="text-danger">-${formatPoints(r.amt)}</td>
                    </tr>
                `;
                tbody.append(rowHtml);
            });
        });
    }

    function setupKasaScanner() {
        $('#form-scan-qr').off('submit').on('submit', function (e) {
            e.preventDefault();
            const token = $('#qr-input').val().trim();
            if (!token) return;

            $.post('/api/niki-loyalty/scan-qr', { token: token }, function (res) {
                if (res.success) {
                    app.alert({
                        type: 'success',
                        title: 'İşlem Başarılı! ✅',
                        message: `
                            <strong>Müşteri:</strong> ${res.customer.username}<br>
                            <strong>Verilen:</strong> ${res.rewardName}<br>
                            <strong>Tutar:</strong> ${res.cost} Puan
                        `,
                        timeout: 5000
                    });
                    $('#qr-input').val(''); // Inputu temizle
                    loadKasaHistory(); // Tabloyu güncelle
                } else {
                    app.alert({ type: 'danger', title: 'Hata', message: res.message });
                }
            });
        });
    }
});

