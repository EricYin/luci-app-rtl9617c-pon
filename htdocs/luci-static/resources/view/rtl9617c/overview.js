'use strict';
'require view';
'require rtl9617c.status as status';
'require rtl9617c.ui as ui';
'require uci';

function firewallFlag(name) {
	var section = uci.sections('firewall', 'defaults')[0];

	return !!section && section[name] === '1';
}

return view.extend({
	load: function() {
		return Promise.all([uci.load('firewall').catch(function() { return null; }), ui.snapshot()])
			.then(function(result) { return result[1]; });
	},
	render: function(initial) {
		return ui.page(_('Status'), _('Optical link, service networks, and wireless at a glance. Interface up does not imply Internet reachability.'), initial, ui.snapshot, function(data) {
			var pon = data.pon || {}, optical = pon.optical || {}, bosa = pon.bosa || {};
			var ent = status.entropyInfo(pon);
			var model = data.board.model || '';
			var hasWifi = (data.wifi || []).length > 0 && !/PT1500/i.test(model);
			return E('div', {}, [data.pon ? status.ponCard(pon) : E('p', { class: 'alert-message warning' }, _('Failed to read PON status.')),
				ui.grid([
					ui.tile(_('Active Protocol'), status.modes[(pon.serdes || {}).mode] || _('Not provided'), _('From active driver mode')),
					ui.tile(_('Optical Temperature'), status.temperature(pon.transceiver), _('From A2h 0x60/0x61')),
					ui.tile(_('Rx / Tx Power'), status.power((pon.transceiver || {}).rx_power_raw) + ' / ' + status.power((pon.transceiver || {}).tx_power_raw), 'A2h 0x66~0x69'),
					ui.tile(_('Optical TX'), optical.tx_disabled == null ? _('Not provided') : optical.tx_disabled === '1' ? _('Shut Off') : _('Allowed'), _('A2h optical telemetry')),
					ui.tile(_('Optical Calibration'), bosa.configured == null ? _('Not provided') : bosa.configured === '1' ? _('Configured') : _('Not Ready'), _('A2h module detected, DDMI available')),
					ui.tile(_('Hardware Entropy'), ent.current, ent.availBits != null
						? (ent.active ? _('Available entropy %s bits').format(ent.availBits) : _('Available entropy %s bits · Inactive fallback').format(ent.availBits))
						: (ent.active ? _('Hardware TRNG active') : _('Hardware TRNG inactive')))
				]),
				status.card(_('Registration & Authentication'), null, ui.authentication(pon)),
				status.offloadCard(pon, firewallFlag('flow_offloading'), firewallFlag('flow_offloading_hw')),
				status.card(_('Service Networks'), null, [ui.networks(data), ui.link(_('Manage Internet'), 'admin/onu/internet')]),
				ui.mtuSummary(data),
				hasWifi ? status.card(_('Wireless Networks'), null, [data.wifiError ? ui.note(_('Failed to read wireless status.')) : ui.grid(data.wifi.map(function(wifi) {
					return status.card(wifi.ssid || wifi.name, status.badge(wifi.up ? _('Running') : _('Stopped'), wifi.up ? 'good' : 'muted'), status.rows([
						[_('Interface'), wifi.name], [_('Channel'), status.value(wifi.channel)], [_('Frequency'), wifi.frequency ? wifi.frequency + ' GHz' : '—'],
						[_('Current PHY Rate'), wifi.bitrate ? wifi.bitrate + ' Mbit/s' : '—']
					]));
				})), ui.link(_('Manage Wi-Fi 6'), 'admin/network/wireless')]) : null,
				ui.fold(_('Physical Ports & Cumulative Traffic'), 'ports', ui.ports(pon)),
				ui.fold(_('OLT-Provisioned GEM Service Channels'), 'paths', ui.services(pon)),
				ui.note((data.board.model || 'PT1500') + ' · ' + ((data.board.release || {}).description || _('Firmware info not provided')))
			]);
		});
	},
	handleSaveApply: null, handleSave: null, handleReset: null
});
