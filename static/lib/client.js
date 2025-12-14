'use strict';

$(document).ready(function () {
    // --- AYARLAR ---
    // Buraya logonun linkini koy. Eğer link yoksa geçici bir kedi ikonu koydum.
    const NIKI_LOGO_URL = 'https://i.ibb.co/nZvtpss/logo-placeholder.png'; 

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

    // 1. Widget'ı Ekrana Koyma ve Veri Çekme Fonksiyonu
    function initNikiWidget() {
        // Eğer giriş yapmamışsa çalışma
        if (!app.user.uid || app.user.uid <= 0) return;

        // Widget zaten varsa tekrar ekleme, sadece veriyi güncelle
        if ($('#niki-floating-widget').length === 0) {
            $('body').append(widgetHtml);
        }

        // VERİYİ DOĞRU YERDEN ÇEK: wallet-data API'si (Kesin çözüm)
        $.get('/api/niki-loyalty/wallet-data', function(data) {
            // Puanı güncelle
            $('#niki-live-points').text(data.points || 0);
            
            // Widget'ı görünür yap
            $('#niki-floating-widget').removeClass('niki-hidden');
        }).fail(function() {
            // Hata olursa 0 yaz ama widget'ı yine de göster
            $('#niki-live-points').text('0');
            $('#niki-floating-widget').removeClass('niki-hidden');
        });
    }

    // 2. Sayfa İlk Açıldığında Çalıştır
    initNikiWidget();

    // 3. Sayfa Değiştiğinde (Menülerde gezerken) Tekrar Çalıştır
    $(window).on('action:ajaxify.end', function () {
        initNikiWidget();
    });

    // --- AKTİFLİK VE PUAN KAZANMA SİSTEMİ ---
    let activeSeconds = 0;
    let isUserActive = false;
    let idleTimer;
    
    // Hareket algılayınca sayacı sıfırla
    function resetIdleTimer() {
        isUserActive = true;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { isUserActive = false; }, 30000); // 30sn hareketsizse pasif ol
    }
    $(window).on('mousemove scroll keydown click touchstart', resetIdleTimer);

    // Her saniye kontrol et
    setInterval(() => {
        // Sadece "Topic" sayfalarında, sekme görünürse ve kullanıcı aktifse say
        if (ajaxify.data.template.topic && document.visibilityState === 'visible' && isUserActive) {
            activeSeconds++;
        }
        
        // 60 saniye dolunca sunucuya bildir
        if (activeSeconds >= 60) {
            sendHeartbeat();
            activeSeconds = 0;
        }
    }, 1000);

    function sendHeartbeat() {
        $.post('/api/niki-loyalty/heartbeat', { _csrf: config.csrf_token }, function(res) {
            if (res.earned) {
                // Puanı anlık güncelle
                $('#niki-live-points').text(res.total);
                
                // Bildirim göster
                showNikiToast(`+${res.points} Puan Kazandın! ☕`);
                
                // Widget'ı zıplat
                $('#niki-floating-widget').addClass('niki-bounce');
                setTimeout(() => $('#niki-floating-widget').removeClass('niki-bounce'), 500);
            }
        });
    }

    // Özel Bildirim (Toast) Fonksiyonu
    function showNikiToast(msg) {
        $('.niki-toast').remove();
        const toast = $(`<div class="niki-toast"><i class="fa fa-paw"></i> ${msg}</div>`);
        $('body').append(toast);
        setTimeout(() => { toast.addClass('show'); }, 100);
        setTimeout(() => { 
            toast.removeClass('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
});