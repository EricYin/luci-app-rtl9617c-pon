'use strict';
'require view';
'require rtl9617c.status as status';
'require rtl9617c.ui as ui';

return view.extend({
	load: function() { return ui.snapshot(); },
	render: function(initial) {
		return ui.page(_('Hardware Identity'), _('Reads the active hardware identity without writing to factory partitions or exporting credentials.'), initial, ui.snapshot, function(data) {
			var pon = data.pon || {}, identity = pon.identity || {}, bosa = pon.bosa || {};
			return E('div', {}, [data.pon ? null : E('p', { class: 'alert-message warning' }, _('Failed to read PON identity.')), ui.grid([
				status.card(_('Device Info'), null, status.rows([[_('Model'), data.board.model || _('Not provided')], [_('System'), data.board.system || _('Not provided')],
					[_('Kernel'), status.value(data.board.kernel)], [_('Firmware'), (data.board.release || {}).description || _('Not provided')]])),
				status.card(_('Active PON Identity'), null, [status.rows([['ONU MAC', status.value(identity.onu_mac)],
					[_('ITU-T SN (Hex)'), status.value(identity.serial_number)], [_('Active Protocol'), status.modes[(pon.serdes || {}).mode] || _('Not provided')]]),
					ui.note(_('EPON does not use ITU-T SN. Identity overrides can be set under Line & Authentication; leave empty to restore factory values.')), ui.link(_('Configure Identity & Auth'), 'admin/onu/config')]),
				status.card(_('Optical Calibration / Telemetry'), null, [status.rows([[_('Config Status'), bosa.configured == null ? _('Not provided') : bosa.configured === '1' ? _('Configured') : _('Unconfigured')],
					[_('BOSA Model'), status.bosaName(bosa)], [_('Init Error Code'), status.value(bosa.error)]].concat(status.opticalRows(pon))),
					ui.note(_('Temperature, voltage, and optical power come from optical module A2h; — is shown when Tx/Rx is 0.'))]),
				typeof status.entropyCard === 'function' ? status.entropyCard(pon) : null
			]), ui.mtuSummary(data), status.card(_('Port MAC Addresses'), null, status.rows((pon.ports || []).map(function(port) { return [port.device, status.value(port.address)]; }))),
			ui.note(_('Preserves the native factory identity and calibration import flow. This page does not write MTD/UBI partitions or read identity data from other devices.'))]);
		});
	},
	handleSaveApply: null, handleSave: null, handleReset: null
});
