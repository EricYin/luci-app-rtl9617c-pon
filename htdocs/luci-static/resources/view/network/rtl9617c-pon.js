'use strict';
'require view';
'require form';
'require rtl9617c.ui as ui';
'require uci';
'require rtl9617c.status as status';

var eponModes = ['epon', 'epon-d10g', 'epon-bi10g'];
var ituModes = ['gpon', 'xgpon', 'xgspon'];

function byteLimit(limit) {
	return function(section, text) {
		if (/[\x00-\x1f\x7f]/.test(text)) return _('Control characters are not allowed.');
		return new TextEncoder().encode(text).length <= limit || _('Maximum %d bytes.').format(limit);
	};
}

return view.extend({
	load: function() {
		return Promise.all([uci.load('pon'), status.callStatus().catch(function() { return null; }), uci.load('network')]);
	},
	render: function(data) {
		var m = new form.Map('pon', _('Line Configuration'), _('Enter only the parameters required by your ISP. Changes take effect after Save & Apply; the optical link may briefly reconnect.'));
		if (!L.hasViewPermission()) m.readonly = true;
		var s = m.section(form.NamedSection, 'pon', 'pon');
		s.tab('link', _('Optical Link'));
		s.tab('identity', _('ISP Authentication'), _('All authentication parameters are optional. Switching protocols only changes visible fields without clearing credentials for other protocols.'));
		s.tab('wan', _('WAN Interface'));
		s.tab('advanced', _('Advanced'));
		var o = s.taboption('link', form.Flag, 'enabled', _('Enable Optical Link'));
		o.rmempty = false;
		o = s.taboption('link', form.ListValue, 'mode', _('Line Protocol'));
		Object.keys(status.modes).forEach(function(mode) { o.value(mode, status.modes[mode]); });
		o.rmempty = false;
		o.description = _('Select according to your ISP line; the banner above shows the actual active protocol and does not change until applied.');
		o = s.taboption('advanced', form.ListValue, 'omcc_version', _('OMCC Version'));
		o.value('0xb0', _('0xb0 (Default)'));
		o.value('0x86', _('0x86 (Compatibility)'));
		o.default = '0xb0';
		o.rmempty = false;
		o.retain = true;
		o.description = _('Usually keep the default. Try 0x86 if the OLT is incompatible during OMCI provisioning.');
		ituModes.forEach(function(mode) { o.depends('mode', mode); });
		o = s.taboption('advanced', form.Flag, 'disable_enhanced_security', _('Disable OMCI Enhanced Security (Class 332)'));
		o.default = '0';
		o.rmempty = false;
		o.retain = true;
		o.description = _('Not disabled by default. Enable only if the line does not support enhanced security; independent of OMCC version.');
		ituModes.forEach(function(mode) { o.depends('mode', mode); });
		o = s.taboption('advanced', form.Value, 'llid_count', _('EPON Logical Links'));
		o.datatype = 'and(uinteger,range(1,32))';
		o.write = function(section, value) { uci.set('pon', section, 'llid_count', String(Number(value))); };
		o.default = '1';
		o.rmempty = false;
		o.retain = true;
		o.description = _('Usually 1.');
		eponModes.forEach(function(mode) { o.depends('mode', mode); });
		o = s.taboption('identity', form.Value, 'onu_mac', _('ONU MAC Address'));
		o.datatype = 'macaddr';
		o.validate = function(section, text) {
			return text === '' || /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i.test(text) &&
				!(parseInt(text.slice(0, 2), 16) & 1) && !/^00(?::00){5}$/.test(text) || _('Please enter a non-zero unicast MAC address, or leave empty to use the factory identity.');
		};
		o.retain = true;
		o.placeholder = _('Leave empty for factory MAC');
		o.description = _('Leave blank to use the factory identity; clear any custom value and apply to restore the factory MAC.');
		[
			['loid', 'LOID', 24, false, eponModes.concat(ituModes)],
			['loid_password', _('LOID Password'), 12, true, eponModes.concat(ituModes)],
			['serial_number', _('ONU Serial Number (SN)'), 16, false, ituModes],
			['registration_id', 'Registration ID', 36, true, ['xgpon', 'xgspon']],
			['ploam_password', _('PLOAM Password'), 10, true, ['gpon']],
			['vendor_id', _('Vendor ID'), 4, false, eponModes],
			['oam_model', _('OAM Model ID'), 4, false, eponModes],
			['equipment_id', _('Equipment ID'), 20, false, eponModes.concat(ituModes)],
			['hardware_version', _('Hardware Version'), 16, false, eponModes.concat(ituModes)],
			['software_version', _('Software Version'), 16, false, eponModes.concat(ituModes)],
			['operator_id', _('OMCI Operator ID'), 4, false, ituModes]
		].forEach(function(field, index) {
			o = s.taboption(index < 5 ? 'identity' : 'advanced', form.Value, field[0], field[1]);
			o.validate = byteLimit(field[2]);
			o.password = field[3];
			o.retain = true;
			o.placeholder = index < 5 ? _('Optional') : _('Leave empty for factory value');
			field[4].forEach(function(mode) { o.depends('mode', mode); });
			if (field[0] === 'hardware_version' || field[0] === 'software_version') {
				o.validate = function(section, text) {
					var mode = this.section.formvalue(section, 'mode') || uci.get('pon', section, 'mode');
					return byteLimit(ituModes.indexOf(mode) !== -1 ? 14 : 16)(section, text);
				};
				o.description = _('Up to 14 bytes in ITU-T modes, up to 16 bytes in EPON modes.');
			}
			if (field[0] === 'operator_id') {
				o.placeholder = _('Leave empty for default');
				o.description = _('Enter if required by your ISP, up to 4 bytes.');
			}
			if (field[0] === 'serial_number') {
				o.placeholder = 'ABCD12345678';
				o.description = _('Leave empty for factory SN; supports 12-char SN or 16-char hex.');
				o.validate = function(section, text) { return text === '' || /^(?:[\x20-\x7e]{4}[0-9a-fA-F]{8}|[0-9a-fA-F]{16})$/.test(text) || _('Please enter a valid 12-char SN or 16-char hex SN.'); };
			}
		});
		o = s.taboption('identity', form.Value, 'omci_psk', _('OMCI Enhanced Auth PSK'));
		o.password = true;
		o.retain = true;
		o.placeholder = _('Optional');
		o.description = _('Enter the 32-char hex key when required by your ISP for enhanced security.');
		o.validate = function(section, text) { return text === '' || /^[0-9a-f]{32}$/i.test(text) || _('Please enter a 32-char hexadecimal key.'); };
		ituModes.forEach(function(mode) { o.depends('mode', mode); });
		if (uci.get('network', 'wan', '.type') === 'interface') {
			var protocol = uci.get('network', 'wan', 'proto');
			o = s.taboption('wan', form.DummyValue, '_wan_protocol', _('WAN Protocol'));
			o.cfgvalue = function() { return { dhcp: 'DHCP', pppoe: 'PPPoE' }[protocol] || protocol || _('Unconfigured'); };
			var device = uci.get('network', 'wan', 'device') || '';
			o = s.taboption('wan', form.DummyValue, '_wan_device', _('Configured WAN Device'));
			o.cfgvalue = function() { return device || _('Unconfigured'); };
		}
		o = s.taboption('wan', form.DummyValue, '_network_settings', _('Configure WAN Interface'));
		o.rawhtml = true;
		o.description = _('Only configured values are shown here, not live connection status. Configure dial-up, IPv6, VLANs, and bridging in Interfaces.');
		o.cfgvalue = function() { return E('a', { href: L.url('admin/network/network') }, _('Open Interfaces →')); };
		return m.render().then(function(form) {
			return ui.page(_('Line & Authentication'), _('Uses native device configuration. Modify only ISP-required parameters; the optical link may briefly reconnect when applied.'),
				data[1], status.callStatus, function(next) {
					return E('div', {}, [status.ponCard(next), ui.fold(_('Live Registration & Authentication'), 'auth', ui.authentication(next))]);
				}, E('section', { class: 'tyf-config' }, form));
		});
	}
});
