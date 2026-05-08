'use strict';

define('admin/plugins/niki-loyalty', ['settings', 'alerts'], function (Settings, alerts) {
	var ACP = {};

	ACP.init = function () {
		console.log('[NIKI ADMIN] init çalıştı');
		console.log('[NIKI ADMIN] form bulundu mu:', $('#niki-loyalty-settings').length);

		Settings.load('niki-loyalty', $('#niki-loyalty-settings'), function () {
			console.log('[NIKI ADMIN] Settings.load tamamlandı');
		});

		$('#save').on('click', function () {
			console.log('[NIKI ADMIN] Kaydet butonuna basıldı');
			Settings.save('niki-loyalty', $('#niki-loyalty-settings'), function () {
				console.log('[NIKI ADMIN] Settings.save tamamlandı');
				alerts.alert({
					type: 'success',
					alert_id: 'niki-loyalty-saved',
					title: 'Ayarlar Kaydedildi',
					message: 'Niki Loyalty ayarları kaydedildi. Uygulamak için NodeBB\'yi yeniden başlatın.',
					timeout: 3000,
				});
			});
		});
	};

	return ACP;
});
