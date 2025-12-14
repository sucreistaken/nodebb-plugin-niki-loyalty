<div class="niki-wallet-wrapper">
    <div class="niki-header-bg"></div>
    
    <div class="niki-wallet-content">
        <div class="niki-wallet-avatar">
            <img src="https://i.imgur.com/kXUe4M6.png" alt="Niki">
        </div>

        <div class="niki-balance-label">Toplam Bakiye</div>
        <div class="niki-balance-big">{points}</div>

        <div class="niki-daily-stats">
            <div style="display:flex; justify-content:space-between; font-size:12px; color:#888; font-weight:600;">
                <span>Günlük Kazanım</span>
                <span>{dailyScore} / {dailyCap}</span>
            </div>
            
            <div class="niki-progress-track">
                <div class="niki-progress-fill" style="width: {dailyPercent}%;"></div>
            </div>
            
            <div style="font-size:11px; color:#aaa;">
                Bugün daha fazla çalışarak limitini doldurabilirsin!
            </div>
        </div>

        <button class="niki-btn-action">
            <i class="fa fa-qrcode"></i> KAHVE AL (QR OLUŞTUR)
        </button>
        
        <p style="font-size:12px; color:#ccc; margin-top:15px;">
            Niki The Cat Coffee &copy; Loyalty Program
        </p>
    </div>
</div>