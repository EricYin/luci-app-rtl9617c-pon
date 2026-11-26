'use strict';
'require baseclass';
'require poll';
'require rpc';
'require rtl9617c.status as status';

var board = rpc.declare({ object: 'system', method: 'board', expect: { '': {} }, reject: true });
var interfaces = rpc.declare({ object: 'network.interface', method: 'dump', expect: { 'interface': [] }, reject: true });
var radios = rpc.declare({ object: 'luci-rpc', method: 'getWirelessDevices', expect: { '': {} }, reject: true });

function note(text) { return E('p', { class: 'tyf-note' }, [text]); }
function link(label, path) { return E('a', { class: 'cbi-button tyf-link', href: L.url.apply(L, path.split('/')) }, [label]); }
function tile(label, value, hint) {
	return E('div', { class: 'tyf-tile' }, [E('dt', {}, [label]), E('dd', {}, [status.value(value)]), hint ? note(hint) : null]);
}
function grid(items) { return E('div', { class: 'tyf-grid' }, items); }
function fold(title, key, contents) {
	return E('details', { class: 'tyf-fold', 'data-tyf-fold': key }, [E('summary', {}, title), E('div', {}, contents)]);
}
function bytes(value) {
	if (value == null || value === '' || !isFinite(Number(value))) return '—';
	var n = Number(value), units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'], i = 0;
	while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
	return n.toFixed(i ? 1 : 0) + ' ' + units[i];
}
function fields(text) {
	var result = {};
	String(text || '').trim().split(/\s+/).forEach(function(token) {
		var index = token.indexOf('=');
		if (index > 0) result[token.slice(0, index)] = token.slice(index + 1);
	});
	return result;
}
function paths(data) {
	return String(data.data_path_raw || '').split('\n').map(fields).filter(function(path) { return path.gem != null; });
}
function services(data, multicastOnly) {
	var available = paths(data).filter(function(path) { return !multicastOnly || path.multicast === '1'; });
	return available.length ? grid(available.map(function(path) {
		return status.card('GEM ' + path.gem, status.badge(path.multicast === '1' ? _('Multicast') : _('Unicast')), status.rows([
			['VLAN', status.value(path.vlan)], ['Alloc-ID / T-CONT', status.value(path.alloc) + ' / ' + status.value(path.tcont)],
			[_('Queue'), status.value(path.queue)], [_('Upstream AES'), path.upstream_aes == null ? _('Not provided') : path.upstream_aes === '1' ? _('Enabled') : _('Disabled')]
		]));
	})) : note(multicastOnly ? _('No OMCI multicast channels obtained yet. This does not mean IPTV is unavailable on the line; check EPON services and local VLANs in Interfaces.') : _('No OMCI GEM service channels to display yet. EPON uses LLIDs instead of GEM.'));
}
function authentication(data) {
	var mode = (data.serdes || {}).mode;
	if (!status.modes[mode]) return note(_('Line protocol not ready; authentication status unavailable.'));
	if (['gpon', 'xgpon', 'xgspon'].indexOf(mode) !== -1) {
		var mac = data.mac || {}, activation = data.activation || {}, path = data.data_path || {};
		var live = status.omciLive(data), omci = live ? data.omci : {};
		var auth = omci.auth == null ? _('Not provided') : +omci.auth === 1 ? _('Authenticated') : +omci.auth > 1 ? _('Authentication Failed (code %s)').format(omci.auth) : _('No LOID auth result received');
		return E('div', {}, [status.rows([
			[_('Activation State'), status.value(mac.activation)], ['ONU-ID', status.value(mode === 'gpon' ? mac.onu_id : activation.omcc_onu_id)],
			[_('OMCI Status'), status.badge(live ? _('Valid') : _('Unavailable'), live ? 'good' : 'danger')],
			[_('OLT LOID Auth'), auth],
			[_('Service Paths'), status.value(path.paths)], [_('OMCI RX / TX'), status.value(omci.rx) + ' / ' + status.value(omci.tx)],
			[_('OMCI Error Code'), status.value(omci.error)], [_('Service Error Code'), status.value(path.error)]
		]), note(_('O5 means the optical link is activated; service usability still depends on OLT provisioning and WAN configuration.'))]);
	}
	var labels = { waiting: _('Awaiting Auth'), challenge: _('Authenticating'), accepted: _('OLT Authenticated'), rejected: _('Auth Rejected') };
	return (data.oam_ports || []).length ? E('div', {}, [E('div', { class: 'tyf-sessions' }, data.oam_ports.map(function(port) {
		var accepted = port.live && port.registered && port.discovery_stable && port.auth_state === 'accepted';
		var acceptedText = port.auth_source === 'ctc-result' ? _('OLT Authenticated') : _('OLT Provisioned');
		var text = !port.live ? _('Session Expired') : !port.registered ? _('Awaiting Registration') :
			port.auth_state === 'accepted' ? (accepted ? acceptedText : _('Awaiting OAM Discovery')) : labels[port.auth_state] || _('Awaiting Status');
		return E('section', { class: 'tyf-session' }, [
			E('div', { class: 'tyf-card-head' }, [E('strong', {}, ['LLID ' + status.value(port.llid)]), status.badge(text,
				accepted ? 'good' : port.live && port.registered && port.auth_state === 'rejected' ? 'danger' : 'muted')]),
			status.rows([[_('Registration'), port.live && port.registered ? _('Registered') : _('Unregistered')],
				[_('OAM Discovery'), port.live && port.discovery_stable ? _('Completed') : _('Incomplete')],
				[_('Auth Method'), port.auth_mode === 'mac' ? 'MAC' : port.auth_mode === 'loid' ? 'LOID' : '—'],
				[_('Auth Source'), port.auth_source === 'ctc-result' ? _('OLT Auth Result') :
					port.auth_source === 'ctc-set-progress' ? _('OLT Provisioning (Vendor Criteria)') : _('Awaiting Result')],
				[_('Auth Duration'), accepted && port.auth_duration_ms != null ?
					_('%d s').format(Math.floor(port.auth_duration_ms / 1000)) : '—'],
				[_('RX / TX Frames'), status.value(port.rx_frames) + ' / ' + status.value(port.tx_frames)]])
		]);
	})), note(_('Note: EPON OLTs typically complete LLID allocation and CTC OAM provisioning for any ONU MAC (which vendor firmware reports as OLT registered/authenticated). ISPs may enforce MAC or broadband account binding at the service VLAN / BRAS layer; verify WAN connectivity accordingly.'))]) : note(_('No OAM authentication sessions yet; awaiting logical link registration.'));
}
function formatDiagValue(val) {
	if (val == null) return _('Not provided');
	if (typeof val === 'object') return JSON.stringify(val);
	return String(val);
}
function diagnostics(data) {
	data = data || {};
	return ['service', 'state', 'serdes', 'optical', 'bosa', 'mac', 'activation', 'mpcp', 'oam_ports', 'omci', 'data_path', 'fec', 'traffic', 'deepq', 'fe', 'fe_resources', 'entropy', 'mtu_summary', 'puc', 'pdc', 'llids'].map(function(name) {
		var entry = name === 'data_path' ? data.data_path_raw : data[name];
		return '[' + name + ']\n' + (entry == null ? _('Not provided') : Array.isArray(entry) ? JSON.stringify(entry, null, 2) : typeof entry === 'object'
			? Object.keys(entry).map(function(key) { return key + ': ' + formatDiagValue(entry[key]); }).join('\n') : entry);
	}).join('\n\n');
}
function formatPortMtu(port) {
	if (port.mtu == null) return '—';
	var parts = [String(port.mtu)];
	if (port.max_mtu != null && isFinite(Number(port.max_mtu)))
		parts.push(_('Max %s').format(port.max_mtu));
	if (port.qdisc)
		parts.push(port.qdisc);
	return parts.join(' · ');
}
function ports(data) {
	return grid((data.ports || []).map(function(port) {
		var up = port.present && port.carrier === '1', stats = port.statistics || {};
		return status.card(port.device, status.badge(!port.present ? _('Absent') : up ? _('Connected') : _('Disconnected'), up ? 'good' : 'muted'), status.rows([
			[_('Speed'), up && Number(port.speed) > 0 ? port.speed + ' Mbps' : '—'],
			[_('MTU / Queue'), formatPortMtu(port)],
			[_('RX / TX'), bytes(stats.rx_bytes) + ' / ' + bytes(stats.tx_bytes)],
			[_('Dropped RX / TX'), status.value(stats.rx_dropped) + ' / ' + status.value(stats.tx_dropped)]
		]));
	}));
}
function mtuSummary(snapshotData) {
	var pon = (snapshotData && snapshotData.pon) || snapshotData || {};
	var summary = pon.mtu_summary || {};
	var allPorts = (pon.ports || []).filter(function(p) { return p && p.present; });
	var ponPort = allPorts.find(function(p) { return p.device === 'pon0'; }) || null;
	var lanPorts = allPorts.filter(function(p) { return /^lan/.test(p.device || ''); });
	var threshold = Number(summary.baby_jumbo_threshold || 1508);

	var ponMtu = summary.pon_mtu != null ? Number(summary.pon_mtu) : (ponPort && ponPort.mtu != null ? Number(ponPort.mtu) : null);
	var ponMax = summary.pon_max_mtu != null ? Number(summary.pon_max_mtu) : (ponPort && ponPort.max_mtu != null ? Number(ponPort.max_mtu) : null);
	var lanMax = summary.lan_min_max_mtu != null ? Number(summary.lan_min_max_mtu) : null;

	var supported = summary.supported;
	if (supported == null && ponMax != null)
		supported = ponMax >= threshold && (lanMax == null || lanMax >= threshold);
	var configured = summary.configured === true || (ponMtu != null && ponMtu >= threshold);

	var badgeText = supported === true
		? (configured ? _('Baby Jumbo Enabled') : _('Baby Jumbo Ready'))
		: supported === false
			? (lanMax != null && lanMax >= threshold
				? _('Partial (LAN Max %s / PON %s)').format(lanMax, status.value(ponMax))
				: _('Standard MTU (Max %s)').format(ponMax != null ? ponMax : 1500))
			: _('Max MTU not provided');
	var badgeTone = supported === true ? 'good' : (supported === false && lanMax != null && lanMax >= threshold ? 'warn' : 'muted');

	var ponText = ponMtu == null ? _('Not provided') : (ponMtu + (ponMax != null ? (' / ' + _('Max %s').format(ponMax)) : ''));
	var lanText = lanPorts.length
		? lanPorts.map(function(p) { return p.device + ':' + status.value(p.mtu); }).join(' · ') +
			(lanMax != null ? (' (' + _('Max %s').format(lanMax) + ')') : '')
		: _('Not provided');

	var wanNets = ((snapshotData && snapshotData.networks) || []).filter(function(n) {
		return n && (n.name === 'wan' || n.name === 'wan6' || /^pppoe-/.test(n.device || ''));
	});
	var netMtus = pon.netdev_mtus || {};
	var wanText = wanNets.length ? wanNets.map(function(n) {
		var dev = n.device;
		var m = dev && netMtus[dev] && netMtus[dev].mtu != null ? netMtus[dev].mtu : null;
		return n.name + (dev ? ('(' + dev + ')') : '') + (m != null ? (': ' + m) : '');
	}).join(' · ') : _('Unconfigured / Disconnected');

	var featParts = [];
	if (ponPort && (ponPort.tx_queues != null || ponPort.rx_queues != null))
		featParts.push(_('PON Queues TX %s / RX %s').format(status.value(ponPort.tx_queues), status.value(ponPort.rx_queues)));
	if (ponPort && ponPort.gso_max_size != null)
		featParts.push('GSO ' + ponPort.gso_max_size + 'B');
	if (ponPort && ponPort.tso_max_size != null)
		featParts.push('TSO ' + ponPort.tso_max_size + 'B');
	if (ponPort && ponPort.gro_max_size != null)
		featParts.push('GRO ' + ponPort.gro_max_size + 'B');
	var feRes = pon.fe_resources || {};
	if (feRes.mtu)
		featParts.push(_('FE MTU Slots %s/%s').format(feRes.mtu.used, feRes.mtu.total));

	var help = supported === true
		? (configured
			? _('Physical interfaces support and have enabled >= %s MTU, satisfying RFC 4638 full 1500-byte PPPoE payload.').format(threshold)
			: _('Physical interfaces allow max_mtu (%s, Baby Jumbo ready). Set PON/WAN MTU to 1508 (PPPoE 1500) in Internet or Interfaces.').format(ponMax))
		: supported === false
			? (lanMax != null && lanMax >= threshold
				? _('LAN max_mtu is unlocked to %s, but PON max_mtu is still %s; both must allow >= 1508 for Baby Jumbo.').format(lanMax, status.value(ponMax))
				: _('Current physical interface max_mtu is %s; PPPoE payload is capped at 1492 (Baby Jumbo inactive).').format(status.value(ponMax)))
			: _('Unable to read physical interface max_mtu (missing ip-full or interface not registered); showing active MTU only.');

	return status.card(_('Interface MTU & Hardware Features'), status.badge(badgeText, badgeTone), [
		status.rows([
			[_('PON Port MTU / Max'), ponText],
			[_('LAN Port MTU'), lanText],
			[_('WAN Interface MTU'), wanText],
			[_('Queues & Offload Features'), featParts.length ? featParts.join(' · ') : '—']
		]),
		note(help)
	]);
}
function snapshot() {
	return Promise.all([status.callStatus().catch(function() { return null; }), board().catch(function() { return {}; }),
		interfaces().catch(function() { return null; }), radios().catch(function() { return null; })]).then(function(data) {
		var wifi = [];
		Object.keys(data[3] || {}).forEach(function(name) {
			var radio = data[3][name];
			(radio.interfaces || []).forEach(function(iface) {
				var info = iface.iwinfo || {};
				wifi.push({ name: iface.ifname || iface.section || name, ssid: info.ssid || (iface.config || {}).ssid,
					up: radio.up && !radio.disabled && !!iface.ifname, channel: info.channel,
					frequency: info.frequency > 0 ? (info.frequency / 1000).toFixed(3) : null,
					bitrate: info.bitrate > 0 ? info.bitrate / 1000 : null });
			});
		});
		return { pon: data[0], board: data[1], wifi: wifi, networkError: data[2] == null, wifiError: data[3] == null,
			networks: (data[2] || []).map(function(net) {
				function addresses(key) { return (net[key] || []).map(function(addr) { return addr.address + '/' + addr.mask; }); }
				var ipv6 = addresses('ipv6-address');
				(net['ipv6-prefix-assignment'] || []).forEach(function(prefix) {
					var local = prefix && prefix['local-address'];
					if (local) ipv6.push(local.address + '/' + local.mask);
				});
				return { name: net.interface, proto: net.proto, up: net.up, device: net.l3_device || net.device,
					ipv4: addresses('ipv4-address'), ipv6: Array.from(new Set(ipv6)) };
			}) };
	});
}
function networks(data) {
	if (data.networkError) return note(_('Failed to read network status; historical data is not shown as live state.'));
	return grid((data.networks || []).filter(function(net) { return net.name !== 'loopback'; }).map(function(net) {
		return status.card(net.name, status.badge(net.up ? _('Interface Up') : _('Disconnected'), net.up ? 'good' : 'muted'), status.rows([
			[_('Protocol / Device'), net.proto + ' / ' + status.value(net.device)],
			['IPv4', net.ipv4.length ? net.ipv4.join(' · ') : '—'], ['IPv6', net.ipv6.length ? net.ipv6.join(' · ') : '—']
		]));
	}));
}
function page(title, description, initial, read, render, form) {
	var last = initial == null ? null : new Date(), pending;
	var eyebrow = E('p', { class: 'tyf-eyebrow' }, 'PT1500 / ONU');
	board().then(function(info) {
		if (info && info.model)
			eyebrow.textContent = info.model + ' / ONU';
	}).catch(function() {});
	var warning = E('p', { class: 'alert-message warning', role: 'status', hidden: initial != null }, _('Failed to read status; no live data yet. Configuration editing is unaffected.'));
	var live = E('div', { class: 'tyf-live' }, initial == null ? null : render(initial));
	var updated = E('span', { class: 'tyf-updated' });
	var button = E('button', { type: 'button', class: 'cbi-button', click: refresh }, _('Refresh Status'));
	function showTime() { updated.textContent = last ? _('Updated %s · 5s refresh').format(last.toLocaleTimeString()) : _('Awaiting initial read'); }
	function refresh() {
		if (pending) return pending;
		button.disabled = true;
		pending = read().then(function(next) {
			var opened = {};
			live.querySelectorAll('details[data-tyf-fold]').forEach(function(node) { opened[node.getAttribute('data-tyf-fold')] = node.open; });
			live.replaceChildren(render(next));
			live.querySelectorAll('details[data-tyf-fold]').forEach(function(node) { node.open = !!opened[node.getAttribute('data-tyf-fold')]; });
			warning.hidden = true;
			last = new Date();
		}).catch(function() {
			warning.hidden = false;
			warning.textContent = last ? _('Refresh failed; the state below is from the last successful read, not live. Configuration editing is unaffected.') : _('Failed to read status; no live data yet.');
		}).finally(function() { pending = null; button.disabled = false; showTime(); });
		return pending;
	}
	showTime();
	poll.add(refresh, 5);
	return E('div', { class: 'tyf-pon cbi-map' }, [status.style(),
		E('div', { class: 'tyf-page-header' }, [E('div', {}, [eyebrow, E('h2', {}, title), note(description)]),
			E('div', { class: 'tyf-refresh-controls' }, [updated, button])]), warning, live, form || null]);
}

return baseclass.extend({ note: note, link: link, tile: tile, grid: grid, fold: fold, bytes: bytes,
	paths: paths, services: services, authentication: authentication, diagnostics: diagnostics, ports: ports,
	mtuSummary: mtuSummary, snapshot: snapshot, networks: networks, page: page });
