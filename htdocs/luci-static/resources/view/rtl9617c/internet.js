'use strict';
'require view';
'require form';
'require uci';
'require tools.widgets as widgets';
'require rtl9617c.ui as ui';

return view.extend({
	load: function() { return Promise.all([uci.load('network'), ui.snapshot()]); },
	render: function(data) {
		var m = new form.Map('network', _('WAN Settings'), _('Edits native network.wan directly without creating extra service configs or taking over LAN ports or the firewall. Uses LuCI connection confirmation and rollback on apply.'));
		if (!L.hasViewPermission()) m.readonly = true;
		var proto = uci.get('network', 'wan', 'proto'), ipaddr = uci.get('network', 'wan', 'ipaddr');
		var editable = uci.get('network', 'wan', '.type') === 'interface' && ['dhcp', 'pppoe', 'static'].indexOf(proto) !== -1 &&
			!!uci.get('network', 'wan', 'device') && !Array.isArray(ipaddr) && !/\//.test(ipaddr || '');
		if (editable) {
			var s = m.section(form.NamedSection, 'wan', 'interface'), o;
			s.tab('general', _('Connection Type')); s.tab('advanced', _('Advanced'));
			o = s.taboption('general', form.ListValue, 'proto', _('Protocol'));
			o.value('dhcp', 'DHCP / IPoE'); o.value('pppoe', 'PPPoE'); o.value('static', _('Static Address')); o.rmempty = false;
			o = s.taboption('general', widgets.DeviceSelect, 'device', _('WAN Device'));
			o.nobridges = false; o.optional = false; o.rmempty = false; o.network = 'wan'; o.exclude = '@wan';
			o.description = _('Keep the current device selection; use Interfaces below to create VLANs or configure bridges.');
			[['username', _('PPPoE Username'), 'pppoe'], ['password', _('PPPoE Password'), 'pppoe'],
				['ipaddr', _('IPv4 Address'), 'static', 'ip4addr("nomask")'], ['netmask', _('Subnet Mask'), 'static', 'ip4addr("true")'], ['gateway', _('IPv4 Gateway'), 'static', 'ip4addr("nomask")']].forEach(function(field) {
				o = s.taboption('general', form.Value, field[0], field[1]); o.depends('proto', field[2]); o.retain = true;
				if (field[3]) o.datatype = field[3];
				if (field[0] === 'ipaddr' || field[0] === 'netmask') o.rmempty = false;
				if (field[0] === 'password') o.password = true;
			});
			o = s.taboption('advanced', form.Value, 'mtu', 'MTU'); o.datatype = 'and(uinteger,range(68,9200))';
			o.placeholder = proto === 'pppoe' ? '1492' : '1500';
			o = s.taboption('advanced', form.ListValue, 'ipv6', _('PPPoE IPv6 Negotiation'));
			o.value('auto', _('Auto')); o.value('0', _('Off')); o.value('1', _('Manual')); o.default = 'auto'; o.depends('proto', 'pppoe'); o.retain = true;
			o.description = _('Controls only PPP IPv6 negotiation without deleting or rewriting wan6; use Interfaces for complex dual-stack setups.');
		}
		else {
			this.handleSaveApply = this.handleSave = this.handleReset = null;
		}
		return m.render().then(function(form) {
			return ui.page(_('Internet'), _('View live interface addresses and configure the existing WAN. Bridging, VLANs, IPv6, and advanced firewall settings remain managed by native OpenWrt.'), data[1], ui.snapshot,
				function(next) { return ui.networks(next); }, E('div', {}, [E('section', { class: 'tyf-config' }, editable ? form :
					ui.note(_('Current WAN requires native Interfaces management: unconfigured WAN, custom protocols, legacy device references, or multi-address/CIDR configs are left untouched.'))),
					E('div', { class: 'tyf-actions' }, [ui.link(_('Interfaces / VLAN / Bridge'), 'admin/network/network'), ui.link(_('Firewall'), 'admin/network/firewall')]) ]));
		});
	}
});
