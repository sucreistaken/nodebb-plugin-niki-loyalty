'use strict';

$(document).ready(function () {
    // --- AYARLAR ---
    // 1. Logo Ayarı (Senin çalışan linkin)
    const NIKI_LOGO_URL = "https://i.ibb.co/nZvtpss/logo-placeholder.png";

    // Widget HTML Şablonu
    const widgetHtml = `
        <div id="niki-floating-widget" class="niki-hidden">
            <div class="niki-widget-content" onclick="ajaxify.go('niki-wallet')">
                <img src="${NIKI_LOGO_URL}" class="niki-widget-logo" alt="Niki">
                <div class="niki-widget-text">
                    <span class="niki-lbl">PUANIM</span>
                    <span class="niki-val" id="niki-live-points">...</span>
                </div>
            </div>
        </div>
    `;

    // 1. Widget Başlatma ve Veri Yönetimi
    function initNikiWidget() {
        if (!app.user.uid || app.user.uid <= 0) return;

        // Widget yoksa ekle
        if ($('#niki-floating-widget').length === 0) {
            $('body').append(widgetHtml);
        }

        // --- HIZLI YÜKLEME (CACHE) ---
        // Önce hafızadaki son puanı hemen göster (Bekletme yapmaz)
        const cachedPoints = localStorage.getItem('niki_last_points');
        if (cachedPoints !== null) {
            $('#niki-live-points').text(cachedPoints);
            $('#niki-floating-widget').removeClass('niki-hidden');
        }

        // Logo Kontrolü (Garanti olsun)
        fixLogo();

        // --- GÜNCEL VERİ ÇEKME ---
        // Arka planda sunucuya sor: "Puan değişti mi?"
        $.get('/api/niki-loyalty/wallet-data', function(data) {
            const freshPoints = data.points || 0;
            
            // Puanı güncelle
            $('#niki-live-points').text(freshPoints);
            $('#niki-floating-widget').removeClass('niki-hidden'); // İlk kez açılıyorsa göster
            
            // Yeni puanı hafızaya at (Bir sonraki giriş için)
            localStorage.setItem('niki_last_points', freshPoints);
            
            // Logoyu tekrar kontrol et (Resim geç yüklendiyse)
            fixLogo();
        }).fail(function() {
            // Hata olursa ve cache yoksa 0 yaz
            if (cachedPoints === null) {
                $('#niki-live-points').text('0');
                $('#niki-floating-widget').removeClass('niki-hidden');
            }
        });
    }

    // Logo Düzeltici (Senin çalışan kodun entegresi)
    function fixLogo() {
        const img = document.querySelector("img.niki-widget-logo");
        if (img && img.src !== NIKI_LOGO_URL) {
            img.src = NIKI_LOGO_URL;
        }
    }

    // Başlat
    initNikiWidget();

    // Sayfa Geçişlerinde Tekrar Çalıştır
    $(window).on('action:ajaxify.end', function () {
        initNikiWidget();
        setTimeout(fixLogo, 500); // 0.5sn sonra son bir kontrol
    });

    // --- AKTİFLİK SİSTEMİ (Heartbeat) ---
    let activeSeconds = 0;
    let isUserActive = false;
    let idleTimer;
    
    function resetIdleTimer() {
        isUserActive = true;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { isUserActive = false; }, 30000);
    }
    $(window).on('mousemove scroll keydown click touchstart', resetIdleTimer);

    setInterval(() => {
        if (ajaxify.data.template.topic && document.visibilityState === 'visible' && isUserActive) {
            activeSeconds++;
        }
        if (activeSeconds >= 60) {
            sendHeartbeat();
            activeSeconds = 0;
        }
    }, 1000);

    function sendHeartbeat() {
        $.post('/api/niki-loyalty/heartbeat', { _csrf: config.csrf_token }, function(res) {
            if (res.earned) {
                // Puanı güncelle
                $('#niki-live-points').text(res.total);
                // Hafızayı da güncelle
                localStorage.setItem('niki_last_points', res.total);

                showNikiToast(`+${res.points} Puan Kazandın! ☕`);
                $('#niki-floating-widget').addClass('niki-bounce');
                setTimeout(() => $('#niki-floating-widget').removeClass('niki-bounce'), 500);
            }
        });
    }

    function showNikiToast(msg) {
        $('.niki-toast').remove();
        const toast = $(`<div class="niki-toast"><i class="fa fa-paw"></i> ${msg}</div>`);
        $('body').append(toast);
        setTimeout(() => { toast.addClass('show'); }, 100);
        setTimeout(() => { 
            toast.removeClass('show');
            setTimeout(() => toast.remove(), 3000);
        }, 3000);
    }
});