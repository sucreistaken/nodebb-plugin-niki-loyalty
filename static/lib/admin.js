'use strict';

define('admin/plugins/niki-loyalty', ['settings', 'alerts'], function (Settings, alerts) {
    var ACP = {};

    ACP.init = function () {
        Settings.load('niki-loyalty', $('#niki-loyalty-settings'));

        $('#save').on('click', function () {
            Settings.save('niki-loyalty', $('#niki-loyalty-settings'), function () {
                // Sunucu tarafında ayarları anında uygula
                socket.emit('plugins.niki.reloadSettings', {}, function (err) {
                    if (err) {
                        return alerts.alert({
                            type: 'danger',
                            alert_id: 'niki-loyalty-error',
                            title: 'Hata',
                            message: 'Ayarlar kaydedildi ama sunucuya uygulanamadı. NodeBB\'yi yeniden başlatın.',
                            timeout: 5000,
                        });
                    }
                    alerts.alert({
                        type: 'success',
                        alert_id: 'niki-loyalty-saved',
                        title: 'Ayarlar Kaydedildi',
                        message: 'Niki Loyalty ayarları kaydedildi ve anında uygulandı.',
                        timeout: 2500,
                    });
                });
            });
        });
    };

    return ACP;
});
