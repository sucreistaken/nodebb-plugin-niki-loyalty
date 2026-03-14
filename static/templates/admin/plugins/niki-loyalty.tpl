<div class="acp-page-container">
    <div class="col-12 col-md-10 col-lg-8 px-0 mx-auto">

        <div class="d-flex justify-content-between align-items-center mb-4">
            <h4 class="fw-bold mb-0"><i class="fa fa-coffee text-warning"></i> Niki Loyalty Ayarları</h4>
            <button id="save" class="btn btn-primary btn-sm">
                <i class="fa fa-save"></i> Kaydet
            </button>
        </div>

        <form id="niki-loyalty-settings">

            <!-- GENEL AYARLAR -->
            <div class="card mb-4">
                <div class="card-header fw-bold"><i class="fa fa-cog"></i> Genel Ayarlar</div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold">Günlük Maksimum Puan Limiti</label>
                            <input type="number" class="form-control" data-key="dailyCap" placeholder="35">
                            <div class="form-text">Bir kullanıcının günde kazanabileceği maksimum puan.</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PUAN TABLOSU -->
            <div class="card mb-4">
                <div class="card-header fw-bold"><i class="fa fa-star text-warning"></i> Puan Tablosu</div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead>
                                <tr>
                                    <th style="width:30%">Aksiyon</th>
                                    <th style="width:35%">Puan</th>
                                    <th style="width:35%">Günlük Limit</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><i class="fa fa-sign-in text-purple"></i> Günlük Giriş</td>
                                    <td><input type="number" step="0.5" class="form-control form-control-sm" data-key="login_points" placeholder="5"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="login_limit" placeholder="1"></td>
                                </tr>
                                <tr>
                                    <td><i class="fa fa-pencil text-primary"></i> Yeni Konu</td>
                                    <td><input type="number" step="0.5" class="form-control form-control-sm" data-key="new_topic_points" placeholder="5"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="new_topic_limit" placeholder="1"></td>
                                </tr>
                                <tr>
                                    <td><i class="fa fa-commenting text-success"></i> Yorum Yazma</td>
                                    <td><input type="number" step="0.5" class="form-control form-control-sm" data-key="reply_points" placeholder="5"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="reply_limit" placeholder="2"></td>
                                </tr>
                                <tr>
                                    <td><i class="fa fa-book text-warning"></i> Konu Okuma</td>
                                    <td><input type="number" step="0.5" class="form-control form-control-sm" data-key="read_points" placeholder="1"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="read_limit" placeholder="10"></td>
                                </tr>
                                <tr>
                                    <td><i class="fa fa-heart text-danger"></i> Beğeni Atma</td>
                                    <td><input type="number" step="0.5" class="form-control form-control-sm" data-key="like_given_points" placeholder="2.5"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="like_given_limit" placeholder="2"></td>
                                </tr>
                                <tr>
                                    <td><i class="fa fa-star text-info"></i> Beğeni Alma</td>
                                    <td><input type="number" step="0.5" class="form-control form-control-sm" data-key="like_taken_points" placeholder="5"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="like_taken_limit" placeholder="2"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="form-text mt-2">Placeholder'daki değerler varsayılan değerlerdir. Boş bırakırsanız varsayılan kullanılır.</div>
                </div>
            </div>

            <!-- ÖDÜLLER -->
            <div class="card mb-4">
                <div class="card-header fw-bold"><i class="fa fa-gift text-danger"></i> Ödüller</div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead>
                                <tr>
                                    <th style="width:60%">Ödül Adı</th>
                                    <th style="width:40%">Gerekli Puan</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><input type="text" class="form-control form-control-sm" data-key="reward0_name" placeholder="Ücretsiz Kahve ☕"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="reward0_cost" placeholder="250"></td>
                                </tr>
                                <tr>
                                    <td><input type="text" class="form-control form-control-sm" data-key="reward1_name" placeholder="%60 İndirimli Kahve"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="reward1_cost" placeholder="180"></td>
                                </tr>
                                <tr>
                                    <td><input type="text" class="form-control form-control-sm" data-key="reward2_name" placeholder="%30 İndirimli Kahve"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="reward2_cost" placeholder="120"></td>
                                </tr>
                                <tr>
                                    <td><input type="text" class="form-control form-control-sm" data-key="reward3_name" placeholder="1 Kurabiye 🍪"></td>
                                    <td><input type="number" class="form-control form-control-sm" data-key="reward3_cost" placeholder="60"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- GRUP BONUSLARI -->
            <div class="card mb-4">
                <div class="card-header fw-bold"><i class="fa fa-users text-success"></i> Grup Katılım Bonusları</div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold">Premium Grup Bonusu</label>
                            <input type="number" class="form-control" data-key="bonus_premium" placeholder="30">
                            <div class="form-text">Premium grubuna katılan kullanıcıya verilecek bonus puan.</div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold">VIP Grup Bonusu</label>
                            <input type="number" class="form-control" data-key="bonus_vip" placeholder="60">
                            <div class="form-text">VIP grubuna katılan kullanıcıya verilecek bonus puan.</div>
                        </div>
                    </div>
                </div>
            </div>

        </form>

    </div>
</div>
