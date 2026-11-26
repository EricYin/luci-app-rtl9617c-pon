'use strict';
'require view';
'require form';
'require uci';
'require rtl9617c.status as status';
'require rtl9617c.ui as ui';

return view.extend({
	load: function() { return Promise.all([uci.load('network'), status.callStatus().catch(function() { return null; })]); },
	render: function(data) {
		var m = new form.Map('network', _('Multicast Settings on Existing Bridges'), _('Uses Linux bridge / netifd IGMP snooping and querier settings directly. Does not automatically remove LAN ports, create service VLANs, or modify the firewall.'));
		if (!L.hasViewPermission()) m.readonly = true;
		var bridges = uci.sections('network', 'device').filter(function(device) { return device.type === 'bridge'; });
		if (!bridges.length) this.handleSaveApply = this.handleSave = this.handleReset = null;
		bridges.forEach(function(bridge) {
			var s = m.section(form.NamedSection, bridge['.name'], 'device', bridge.name), o;
			o = s.option(form.DummyValue, '_ports', _('Bridge Ports'));
			o.cfgvalue = function() { return L.toArray(bridge.ports).join(' · ') || _('Unconfigured'); };
			o = s.option(form.Flag, 'igmp_snooping', 'IGMP snooping'); o.default = '0';
			o.description = _('Forward multicast based on group membership to avoid flooding all ports.');
			o = s.option(form.Flag, 'multicast_querier', _('Multicast Querier')); o.rmempty = false;
			// netifd inherits snooping when the explicit querier option is absent.
			o.cfgvalue = function(section) {
				return uci.get('network', section, 'multicast_querier') || uci.get('network', section, 'igmp_snooping') || '0';
			};
			o.description = _('Enable only if this bridge needs to send multicast queries locally.');
		});
		return m.render().then(function(form) {
			return ui.page(_('IPTV & Multicast'), _('Verify OLT-provisioned multicast channels first, then configure local service VLANs and set-top box ports.'), data[1], status.callStatus,
				function(next) { return status.card(_('OLT Multicast Channels'), null, ui.services(next, true)); }, E('div', {}, [
					E('section', { class: 'tyf-config' }, bridges.length ? form : ui.note(_('No native device-type bridges found yet. Edit legacy interface bridge configs in Interfaces.'))),
					ui.link(_('Configure IPTV VLAN / Dedicated Port / Single-Line Multiplexing'), 'admin/network/network'),
					ui.note(_('Dedicated port bridging and single-line multiplexing use native VLAN/bridge settings. This package does not install IGMP proxy, HTTP multicast relay, or SIP/H.248 voice services, so no unbacked toggles are shown.'))
				]));
		});
	}
});
