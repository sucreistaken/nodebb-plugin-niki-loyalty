'use strict';

/* globals $, app, socket, ajaxify, utils, config */

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

    }

    // Fonksiyonu global yap (Konsoldan test için)
    window.showNikiToast = showNikiToast;

    // -------------------------------------------------------------
    // 🐱 FLOATING WIDGET - DEVRE DIŞI
    // Widget NodeBB widget sisteminden elle ekleniyor
    // -------------------------------------------------------------

    // Sadece puan güncelleme fonksiyonu
    function updateFloatingWidget() {
        // Custom widget'ta puan gösterimi varsa güncelle
        if ($('#widget-user-points').length === 0) return;

        // Kullanıcı giriş yapmamışsa API çağrısı yapma
        if (!app.user || !app.user.uid) return;

        $.get('/api/niki-loyalty/wallet-data', function (data) {
            if (data && typeof data.points !== 'undefined') {
                var points = Math.floor(data.points);
                $('#widget-user-points').text(points);
            }
        }).fail(function () {
        });
    }
    // Fonksiyonu global yap
    window.updateFloatingWidget = updateFloatingWidget;

    // Login sonrası redirect sorununu önlemek için erken API çağrısı yapma
    var isJustLoggedIn = window.location.search.includes('loggedin');

    // Sayfa yüklendiğinde widget puanını güncelle (login değilse)
    setTimeout(function () {
        if (app.user && app.user.uid && !isJustLoggedIn) {
            updateFloatingWidget();
        }
    }, 2000);

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
        $.post('/api/niki-loyalty/daily-checkin', { _csrf: config.csrf_token }, function (response) {
            if (response && response.success) {
                // Puan kazanıldı! Bildirim göster
                showNikiToast('Günlük giriş için <strong style="color:#ffd700">+' + response.earned + ' Puan</strong> kazandın! 👋');

                // Widget'ı güncelle
                if (typeof updateSidebarWidget === 'function') {
                    updateSidebarWidget();
                }
            }
            // Başarılı veya zaten alınmış, bugünü kaydet
            localStorage.setItem(storageKey, today);
        }).fail(function () {
            // Hata durumunda sessizce devam et
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
        if (ajaxify.data && ajaxify.data.template && ajaxify.data.template.name === 'topic') {

            // 10 Dakikada bir tetikle (Günde 10 limit var backendde)
            heartbeatInterval = setInterval(function () {
                if (document.hidden) return; // Sekme aktif değilse sayma


                $.post('/api/niki-loyalty/heartbeat', { _csrf: config.csrf_token }, function (response) {
                    if (response && response.earned) {
                        // Eğer puan kazandıysa özel Niki bildirimi göster
                        if (typeof showNikiToast === 'function') {
                            showNikiToast('Konu okuduğun için <strong style="color:#ffd700">+1 Puan</strong> kazandın! 🐈');
                        }
                        // Widget'ı hemen güncelle
                        updateSidebarWidget();
                    } else {
                    }
                });
            }, 600000); // 10 Dakika = 600.000 ms
        }

        // Wallet flag temizleme (widget-bağımsız, burada kalabilir)
        if (data.url !== 'niki-wallet') {
            sessionStorage.removeItem('niki_wallet_reloaded');
        }

        // Login sonrası widget güncelleme (gecikmeli)
        if (data && data.url && data.url.includes('login')) {
            setTimeout(function () {
                if (app.user && app.user.uid) {
                    updateSidebarWidget();
                }
            }, 3000);
        }
    });

    // ============================================================
    // Widget'lar yüklendikten sonra çalışacak kodlar
    // action:ajaxify.end widget DOM'u yüklenmeden ÖNCE tetiklenir,
    // bu yüzden widget elementlerine bağlı kodlar burada olmalı.
    // ============================================================
    $(window).on('action:widgets.loaded', function () {
        // 💰 CÜZDAN SAYFASI
        if ($('#user-points').length) {
            loadWalletData();
        }

        // 🏪 KASA SAYFASI
        if ($('#kasa-history-tbody').length || $('#form-scan-qr').length) {
            loadKasaHistory();
            setupKasaScanner();
        }

        // Sidebar widget güncelle
        if (app.user && app.user.uid) {
            updateSidebarWidget();
        }
    });

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
            $('#widget-daily-text').text(scoreText + ' / ' + data.dailyCap);
            // Hedef label'ını da dinamik güncelle
            $('.progress-text .target').text('Hedef: ' + data.dailyCap);

            // 3. ACTIONS bilgisiyle puan ve limitleri dinamik güncelle
            const act = data.actions || {};
            const c = data.counts || {};

            // Helper: İlerleme Yazdırma Fonksiyonu
            function setProgress(id, current, max, rowId, rewardText) {
                current = parseInt(current || 0);
                const el = $('#' + id);
                const row = $('#' + rowId);

                // Puan miktarını güncelle
                if (rewardText) {
                    row.find('.item-reward').text(rewardText);
                }

                if (current >= max) {
                    el.html('<span style="color:#4caf50; font-weight:bold;">Tamamlandı ✅</span>');
                    row.addClass('completed');
                } else {
                    el.text(current + '/' + max + ' Tamamlandı');
                    row.removeClass('completed');
                }
            }

            // Dinamik: backend ACTIONS'dan puan ve limit bilgilerini al
            var loginAct = act.login || { points: 5, limit: 1 };
            var topicAct = act.new_topic || { points: 5, limit: 1 };
            var replyAct = act.reply || { points: 5, limit: 2 };
            var readAct = act.read || { points: 1, limit: 10 };
            var likeGivenAct = act.like_given || { points: 2.5, limit: 2 };
            var likeTakenAct = act.like_taken || { points: 5, limit: 2 };

            setProgress('w-count-new_topic', c.new_topic, topicAct.limit, 'item-new-topic', '+' + topicAct.points);
            setProgress('w-count-reply', c.reply, replyAct.limit, 'item-reply', '+' + replyAct.points);
            setProgress('w-count-read', c.read, readAct.limit, 'item-read', '+' + readAct.points);

            // Like: toplam limit = like_given.limit + like_taken.limit
            var totalLikeLimit = likeGivenAct.limit + likeTakenAct.limit;
            var totalLike = (parseInt(c.like_given || 0) + parseInt(c.like_taken || 0));
            setProgress('w-count-like', totalLike, totalLikeLimit, 'item-like', '+' + likeGivenAct.points + '/+' + likeTakenAct.points);

            // Login
            if (c.login >= 1) {
                $('#w-count-login').html('<span style="color:#4caf50;">Alındı ✅</span>');
                $('#item-login').addClass('completed');
            } else {
                $('#w-count-login').text('Giriş Yapılmadı');
                $('#item-login').removeClass('completed');
            }
            $('#item-login .item-reward').text('+' + loginAct.points);
        });
    }

    // -------------------------------------------------------------
    // 🔔 PUAN BİLDİRİMİ DİNLEYİCİSİ (SOCKET) - Özel Niki Toast
    // -------------------------------------------------------------
    socket.off('event:niki_award').on('event:niki_award', function (data) {
        // 1. Özel Niki Toast Bildirimi Göster
        const pointsText = data.message || `+${data.points || ''} Puan kazandın!`;
        showNikiToast(pointsText);

        // 2. Eğer Sidebar Widget varsa anlık güncelle (Sayfa yenilemeye gerek kalmasın)
        if (typeof updateSidebarWidget === 'function') {
            updateSidebarWidget();
        }
    });
    // -------------------------------------------------------------
    // CÜZDAN FONKSİYONLARI
    // -------------------------------------------------------------
    function loadWalletData() {
        $.get('/api/niki-loyalty/wallet-data').done(function (data) {
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
                                <small class="text-muted me-2">${(dateStr)}</small>
                                <span>${(item.txt)}</span>
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
                $.post('/api/niki-loyalty/generate-qr', { _csrf: config.csrf_token }, function (res) {
                    $('#btn-generate-qr').prop('disabled', false);
                    if (res.success) {
                        app.alert({
                            type: 'info',
                            title: 'Kod Oluşturuldu',
                            message: '<div class="text-center">Kasiyere bu kodu göster:<br><h2 style="margin:10px 0; letter-spacing:2px;">' + (res.token) + '</h2><small>2 dakika geçerli</small></div>',
                            timeout: 10000
                        });
                    } else {
                        app.alert({ type: 'danger', message: (res.message) });
                    }
                }).fail(function () {
                    $('#btn-generate-qr').prop('disabled', false);
                    app.alert({ type: 'danger', message: 'QR kod oluşturulamadı. Tekrar deneyin.' });
                });
            });
        }).fail(function () {
        });
    }

    // -------------------------------------------------------------
    // KASA FONKSİYONLARI (Admin/Mod)
    // -------------------------------------------------------------
    function loadKasaHistory() {
        const tbody = $('#kasa-history-tbody');
        if (tbody.length === 0) return;

        $.get('/api/niki-loyalty/kasa-history', function (response) {
            // API {data: [...], stats, rewardTypes, hasMore} formatında döner
            var rows = Array.isArray(response) ? response : (response.data || []);
            tbody.empty();
            if (!rows || rows.length === 0) {
                tbody.append('<tr><td colspan="5" class="text-center">Geçmiş işlem yok.</td></tr>');
                return;
            }
            rows.forEach(function (r) {
                var dateStr = new Date(r.ts).toLocaleDateString() + ' ' + new Date(r.ts).toLocaleTimeString();
                var custName = r.cust || 'Bilinmeyen';
                var rowHtml = '<tr>' +
                    '<td>' + (dateStr) + '</td>' +
                    '<td>' +
                        '<a href="' + (r.profileUrl || '#') + '" target="_blank" class="text-decoration-none">' +
                            '<span class="avatar avatar-sm" style="background-color: ' + (r.iconBg || '#555') + ';">' + (custName.charAt(0).toUpperCase()) + '</span> ' +
                            (custName) +
                        '</a>' +
                    '</td>' +
                    '<td>' + (r.reward || '') + '</td>' +
                    '<td class="text-danger">-' + formatPoints(r.amt) + '</td>' +
                    '</tr>';
                tbody.append(rowHtml);
            });
        }).fail(function () {
            tbody.empty();
            tbody.append('<tr><td colspan="5" class="text-center text-danger">Geçmiş yüklenemedi.</td></tr>');
        });
    }

    function setupKasaScanner() {
        $('#form-scan-qr').off('submit').on('submit', function (e) {
            e.preventDefault();
            const token = $('#qr-input').val().trim();
            if (!token) return;

            $.post('/api/niki-loyalty/scan-qr', { token: token, _csrf: config.csrf_token }, function (res) {
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

