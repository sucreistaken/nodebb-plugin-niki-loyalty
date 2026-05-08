<div class="acp-page-container">
	<div class="col-lg-9">

		<div class="panel panel-default">
			<div class="panel-heading"><i class="fa fa-coffee"></i> Niki Loyalty Ayarları</div>
			<div class="panel-body">

				<form id="niki-loyalty-settings">

					<!-- GENEL AYARLAR -->
					<fieldset>
						<legend>Genel Ayarlar</legend>
						<div class="form-group">
							<label for="dailyCap">Günlük Maksimum Puan Limiti</label>
							<input type="number" id="dailyCap" name="dailyCap" data-key="dailyCap" class="form-control" placeholder="35">
							<p class="help-block">Bir kullanıcının günde kazanabileceği maksimum puan.</p>
						</div>
					</fieldset>

					<hr/>

					<!-- PUAN TABLOSU -->
					<fieldset>
						<legend>Puan Tablosu</legend>

						<div class="row">
							<div class="col-sm-4"><strong>Aksiyon</strong></div>
							<div class="col-sm-4"><strong>Puan</strong></div>
							<div class="col-sm-4"><strong>Günlük Limit</strong></div>
						</div>
						<hr style="margin:5px 0 10px"/>

						<div class="row form-group">
							<div class="col-sm-4"><label><i class="fa fa-sign-in"></i> Günlük Giriş</label></div>
							<div class="col-sm-4"><input type="number" step="0.5" id="login_points" name="login_points" data-key="login_points" class="form-control" placeholder="5"></div>
							<div class="col-sm-4"><input type="number" id="login_limit" name="login_limit" data-key="login_limit" class="form-control" placeholder="1"></div>
						</div>
						<div class="row form-group">
							<div class="col-sm-4"><label><i class="fa fa-pencil"></i> Yeni Konu</label></div>
							<div class="col-sm-4"><input type="number" step="0.5" id="new_topic_points" name="new_topic_points" data-key="new_topic_points" class="form-control" placeholder="5"></div>
							<div class="col-sm-4"><input type="number" id="new_topic_limit" name="new_topic_limit" data-key="new_topic_limit" class="form-control" placeholder="1"></div>
						</div>
						<div class="row form-group">
							<div class="col-sm-4"><label><i class="fa fa-commenting"></i> Yorum Yazma</label></div>
							<div class="col-sm-4"><input type="number" step="0.5" id="reply_points" name="reply_points" data-key="reply_points" class="form-control" placeholder="5"></div>
							<div class="col-sm-4"><input type="number" id="reply_limit" name="reply_limit" data-key="reply_limit" class="form-control" placeholder="2"></div>
						</div>
						<div class="row form-group">
							<div class="col-sm-4"><label><i class="fa fa-book"></i> Konu Okuma</label></div>
							<div class="col-sm-4"><input type="number" step="0.5" id="read_points" name="read_points" data-key="read_points" class="form-control" placeholder="1"></div>
							<div class="col-sm-4"><input type="number" id="read_limit" name="read_limit" data-key="read_limit" class="form-control" placeholder="10"></div>
						</div>
						<div class="row form-group">
							<div class="col-sm-4"><label><i class="fa fa-heart"></i> Beğeni Atma</label></div>
							<div class="col-sm-4"><input type="number" step="0.5" id="like_given_points" name="like_given_points" data-key="like_given_points" class="form-control" placeholder="2.5"></div>
							<div class="col-sm-4"><input type="number" id="like_given_limit" name="like_given_limit" data-key="like_given_limit" class="form-control" placeholder="2"></div>
						</div>
						<div class="row form-group">
							<div class="col-sm-4"><label><i class="fa fa-star"></i> Beğeni Alma</label></div>
							<div class="col-sm-4"><input type="number" step="0.5" id="like_taken_points" name="like_taken_points" data-key="like_taken_points" class="form-control" placeholder="5"></div>
							<div class="col-sm-4"><input type="number" id="like_taken_limit" name="like_taken_limit" data-key="like_taken_limit" class="form-control" placeholder="2"></div>
						</div>

						<p class="help-block">Boş bırakırsanız placeholder'daki varsayılan değer kullanılır.</p>
					</fieldset>

					<hr/>

					<!-- ÖDÜLLER -->
					<fieldset>
						<legend>Ödüller</legend>

						<div class="row">
							<div class="col-sm-8"><strong>Ödül Adı</strong></div>
							<div class="col-sm-4"><strong>Gerekli Puan</strong></div>
						</div>
						<hr style="margin:5px 0 10px"/>

						<div class="row form-group">
							<div class="col-sm-8"><input type="text" id="reward0_name" name="reward0_name" data-key="reward0_name" class="form-control" placeholder="Ücretsiz Kahve"></div>
							<div class="col-sm-4"><input type="number" id="reward0_cost" name="reward0_cost" data-key="reward0_cost" class="form-control" placeholder="250"></div>
						</div>
						<div class="row form-group">
							<div class="col-sm-8"><input type="text" id="reward1_name" name="reward1_name" data-key="reward1_name" class="form-control" placeholder="%60 İndirimli Kahve"></div>
							<div class="col-sm-4"><input type="number" id="reward1_cost" name="reward1_cost" data-key="reward1_cost" class="form-control" placeholder="180"></div>
						</div>
						<div class="row form-group">
							<div class="col-sm-8"><input type="text" id="reward2_name" name="reward2_name" data-key="reward2_name" class="form-control" placeholder="%30 İndirimli Kahve"></div>
							<div class="col-sm-4"><input type="number" id="reward2_cost" name="reward2_cost" data-key="reward2_cost" class="form-control" placeholder="120"></div>
						</div>
						<div class="row form-group">
							<div class="col-sm-8"><input type="text" id="reward3_name" name="reward3_name" data-key="reward3_name" class="form-control" placeholder="1 Kurabiye"></div>
							<div class="col-sm-4"><input type="number" id="reward3_cost" name="reward3_cost" data-key="reward3_cost" class="form-control" placeholder="60"></div>
						</div>
					</fieldset>

					<hr/>

					<!-- GRUP BONUSLARI -->
					<fieldset>
						<legend>Grup Katılım Bonusları</legend>
						<div class="form-group">
							<label for="bonus_premium">Premium Grup Bonusu</label>
							<input type="number" id="bonus_premium" name="bonus_premium" data-key="bonus_premium" class="form-control" placeholder="30">
							<p class="help-block">Premium grubuna katılan kullanıcıya verilecek bonus puan.</p>
						</div>
						<div class="form-group">
							<label for="bonus_vip">VIP Grup Bonusu</label>
							<input type="number" id="bonus_vip" name="bonus_vip" data-key="bonus_vip" class="form-control" placeholder="60">
							<p class="help-block">VIP grubuna katılan kullanıcıya verilecek bonus puan.</p>
						</div>
					</fieldset>

				</form>
			</div>
		</div>

		<button class="btn btn-primary" id="save">
			<i class="fa fa-save"></i> Kaydet
		</button>

	</div>
</div>
