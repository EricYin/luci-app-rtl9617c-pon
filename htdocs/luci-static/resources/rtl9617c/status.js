'use strict';
'require baseclass';
'require rpc';

var callStatus = rpc.declare({ object: 'luci.rtl9617c-pon', method: 'status', expect: { '': {} }, reject: true });
var modes = {
	epon: 'EPON', 'epon-d10g': _('10G EPON (Asymmetric)'), 'epon-bi10g': _('10G EPON (Symmetric)'),
	gpon: 'GPON', xgpon: 'XG-PON', xgspon: 'XGS-PON'
};

function value(v) { return v == null || v === '' ? '—' : String(v); }
function flag(v) { return v === '1' || v === 1 || v === true; }
function s16(raw) {
	var n = Number(raw);
	return isFinite(n) && (n & 0x8000) ? n - 0x10000 : n;
}
function temperature(data) {
	var raw = (data || {}).temperature_raw;
	if (raw == null || raw === '') return '—';
	return (s16(raw) / 256).toFixed(1) + ' °C';
}
function voltage(data) {
	var raw = Number((data || {}).voltage_raw);
	return isFinite(raw) && raw > 0 ? (raw * 100e-6).toFixed(3) + ' V' : '—';
}
function bias(data) {
	var raw = Number((data || {}).bias_raw);
	return isFinite(raw) && raw > 0 ? (raw * 2e-3).toFixed(2) + ' mA' : '—';
}
function power(raw) {
	var n = Number(raw);
	if (!isFinite(n) || n <= 0) return '—';
	return (10 * Math.log10(n * 0.1e-3)).toFixed(2) + ' dBm';
}
function opticalRows(data) {
	var t = (data || {}).transceiver || {};
	return [[_('Temperature'), temperature(t)], [_('Voltage'), voltage(t)],
		[_('Tx Bias'), bias(t)], [_('Tx Optical Power'), power(t.tx_power_raw)],
		[_('Rx Optical Power'), power(t.rx_power_raw)]];
}
function bosaName(bosa) {
	if (!bosa) return '—';
	if (bosa.identity) {
		var text = bosa.identity.split('/').map(function(hex) {
			return String.fromCharCode(parseInt(hex, 16));
		}).join('');
		if (/^[\x20-\x7e]{2,}$/.test(text)) return text;
	}
	return value(bosa.model);
}
function badge(text, tone) { return E('span', { class: 'tyf-badge tyf-' + (tone || 'muted') }, [text]); }
function rows(items) {
	return E('dl', { class: 'tyf-facts' }, items.reduce(function(nodes, item) {
		return nodes.concat([E('dt', {}, [item[0]]), E('dd', {}, [item[1] == null ? '—' : item[1]])]);
	}, []));
}
function card(title, state, content) {
	return E('section', { class: 'tyf-card' }, [E('div', { class: 'tyf-card-head' }, [E('h3', {}, [title]), state])].concat(content == null ? [] : content));
}
function omciLive(data) {
	var omci = data.omci, path = data.data_path || {};
	return !!(omci && omci.live && (omci.session == null || path.session == null || String(omci.session) === String(path.session)));
}
function ponState(data) {
	data = data || {};
	var serdes = data.serdes || {}, mac = data.mac || {}, mpcp = data.mpcp || {};
	if (data.service && data.service.enabled === '0')
		return { text: _('Disabled'), tone: 'muted' };
	var failed = ['service', 'activation', 'bosa', 'serdes', 'mac', 'mpcp'].find(function(name) {
		return data[name] && data[name].error != null && +data[name].error !== 0;
	});
	if (failed)
		return { text: _('Init Error'), tone: 'danger', help: _('%s error code: %s. Check Diagnostics and the system log.').format(failed, data[failed].error) };
	if (flag((data.optical || {}).tx_fault))
		return { text: _('Optical TX Fault'), tone: 'danger', help: _('Optical module reported TX Fault. Check Diagnostics.') };
	if (flag((data.optical || {}).rx_los) || flag(serdes.rx_los))
		return { text: _('RX LOS'), tone: 'danger', help: _('No incoming optical signal detected. Check the fiber and uplink.') };
	if (!modes[serdes.mode] || serdes.configured == null)
		return { text: _('Status Unavailable'), tone: 'muted', help: _('Driver has not provided a valid link state yet. Check the system log.') };
	if (serdes.configured === '0' || mac.enabled === '0' || /^epon/.test(serdes.mode) && mpcp.enabled === '0')
		return { text: _('Disabled'), tone: 'muted' };
	if (/^(gpon|xgpon|xgspon)$/.test(serdes.mode)) {
		var businessError = ['data_path', 'omci'].find(function(name) {
			return data[name] && (name !== 'omci' || omciLive(data)) && data[name].error != null && +data[name].error !== 0;
		});
		if (businessError)
			return { text: _('Service Config Error'), tone: 'danger', help: _('%s error code: %s. Check Diagnostics.').format(businessError, data[businessError].error) };
		if (!omciLive(data))
			return { text: _('OMCI Unavailable'), tone: 'danger', help: _('Unable to read the latest state from a live control process; historical data remains in Diagnostics. Check the system log.') };
		if (+data.omci.auth > 1)
			return { text: _('Authentication Failed'), tone: 'danger', help: _('OLT returned LOID auth status code: %s. Verify your ISP credentials.').format(data.omci.auth) };
		return mac.activation === 'O5' && flag(mac.prepared)
			? flag((data.data_path || {}).configured)
				? { text: _('Activated · Services Configured'), tone: 'good' }
				: { text: _('Activated · Awaiting Services'), tone: 'warn' }
			: { text: _('Awaiting Activation'), tone: 'warn', help: _('Activation state: %s').format(value(mac.activation)) };
	}
	if (!flag(mpcp.enabled) || !/^[0-9a-f]+$/i.test(mpcp.registered || '') || !parseInt(mpcp.registered, 16))
		return { text: _('Awaiting Registration'), tone: 'warn' };
	var ports = (data.oam_ports || []).filter(function(p) { return p.live && p.registered; });
	var rejected = ports.find(function(p) { return p.auth_state === 'rejected'; });
	if (rejected)
		return { text: _('Authentication Failed'), tone: 'danger', help: rejected.auth_mode === 'loid' ? _('OLT rejected LOID authentication. Check your LOID and password.') : _('OLT rejected authentication. Check your ONU MAC address or ISP credentials.') };
	var accepted = ports.find(function(p) { return p.auth_state === 'accepted' && p.discovery_stable; });
	if (accepted)
		return accepted.auth_source === 'ctc-result'
			? { text: _('Registered · OLT Authenticated'), tone: 'good', help: _('OLT returned a CTC authentication pass result; if your ISP also checks MAC or account credentials at the service layer, verify your WAN dial-up or service status.') }
			: { text: _('Registered · OLT Provisioned'), tone: 'good', help: _('OLT completed OAM discovery and CTC service provisioning (vendor pass criteria for OLT registration). Some ISPs validate unregistered MACs at the upper VLAN/BRAS layer rather than OAM; verify actual WAN connectivity.') };
	return { text: _('Registered · Awaiting Auth'), tone: 'warn' };
}

function ponCard(data) {
	data = data || {};
	var state = ponState(data), optical = data.optical || {}, serdes = data.serdes || {};
	var los = flag(serdes.rx_los) || flag(optical.rx_los) ? _('RX LOS') :
		serdes.rx_los != null || optical.rx_los != null ? _('No LOS') : _('Not provided');
	return E('section', { class: 'tyf-link-panel', 'data-tone': state.tone }, [
		E('div', { class: 'tyf-link-state' }, [
			E('p', { class: 'tyf-eyebrow' }, _('PON / LIVE OPTICAL LINK')),
			E('h3', {}, [E('span', { class: 'tyf-state-dot', 'aria-hidden': 'true' }), state.text]),
			E('p', { class: 'tyf-note' }, state.help || _('Line registration and authentication do not guarantee Internet connectivity; check WAN status in Interfaces.'))]),
		E('div', { class: 'tyf-link-facts' }, rows([
			[_('Active Protocol'), modes[serdes.mode] || value(serdes.mode)],
			[_('Rx Signal'), los],
			[_('TX Alarm'), optical.tx_fault == null ? _('Not provided') : flag(optical.tx_fault) ? _('TX Fault') : _('No TX Fault')]
		].concat(opticalRows(data))))
	]);
}

var SVG_NS = 'http://www.w3.org/2000/svg';
var offloadSample = null;
var shortModes = {
	epon: 'EPON', 'epon-d10g': '10G EPON', 'epon-bi10g': _('10G Sym'),
	gpon: 'GPON', xgpon: 'XG-PON', xgspon: 'XGS-PON'
};

function svgEl(tag, attrs, children) {
	var el = document.createElementNS(SVG_NS, tag);
	if (attrs) {
		Object.keys(attrs).forEach(function(k) {
			if (attrs[k] != null)
				el.setAttribute(k, String(attrs[k]));
		});
	}
	if (children != null) {
		(Array.isArray(children) ? children : [children]).forEach(function(child) {
			if (child == null)
				return;
			el.appendChild(typeof child === 'string' || typeof child === 'number'
				? document.createTextNode(String(child))
				: child);
		});
	}
	return el;
}

function formatRate(bps) {
	if (bps == null || !isFinite(bps) || bps < 0)
		return null;
	var units = ['B/s', 'KiB/s', 'MiB/s', 'GiB/s'];
	var v = bps, i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return v.toFixed(i ? 1 : 0) + ' ' + units[i];
}

function formatBytes(bytes) {
	if (bytes == null || !isFinite(bytes))
		return '—';
	var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
	var v = Number(bytes), i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return v.toFixed(i ? 1 : 0) + ' ' + units[i];
}

function flowSpeedCls(bps, hasFlows, active) {
	if (!active)
		return 'is-off';
	if (bps != null && bps >= 5 * 1024 * 1024)
		return 'is-fast';
	if (bps != null && bps >= 256 * 1024)
		return 'is-med';
	return (hasFlows || (bps != null && bps > 128)) ? 'is-slow' : 'is-idle';
}

function durationForSpeed(cls) {
	return cls === 'is-fast' ? 850 : cls === 'is-med' ? 1300 : cls === 'is-slow' ? 2000 : 0;
}

function phaseStyle(ms) {
	if (!ms)
		return null;
	var delay = -(Date.now() % ms);
	return 'animation-duration:' + ms + 'ms;animation-delay:' + delay + 'ms';
}

function sampleRates(data) {
	var ponPort = (data.ports || []).find(function(p) { return p.device === 'pon0'; });
	var pStats = (ponPort && ponPort.statistics) || {};
	var nowMs = data.uptime_ms != null ? Number(data.uptime_ms) : Date.now();
	var fp = data.fe_paths || {};
	var up = fp.upstream || {}, down = fp.downstream || {};
	var curr = {
		ts: nowMs,
		ponTx: pStats.tx_bytes == null ? null : Number(pStats.tx_bytes),
		ponRx: pStats.rx_bytes == null ? null : Number(pStats.rx_bytes),
		feUp: up.bytes == null ? null : Number(up.bytes),
		feDown: down.bytes == null ? null : Number(down.bytes),
		rates: offloadSample ? offloadSample.rates : { ponTxBps: null, ponRxBps: null, feUpBps: null, feDownBps: null }
	};
	if (offloadSample && nowMs !== offloadSample.ts) {
		var dt = (nowMs - offloadSample.ts) / 1000;
		if (dt >= 0.4 && dt <= 120) {
			function diffRate(a, b) {
				return (a != null && b != null && a >= b) ? (a - b) / dt : null;
			}
			curr.rates = {
				ponTxBps: diffRate(curr.ponTx, offloadSample.ponTx),
				ponRxBps: diffRate(curr.ponRx, offloadSample.ponRx),
				feUpBps: diffRate(curr.feUp, offloadSample.feUp),
				feDownBps: diffRate(curr.feDown, offloadSample.feDown)
			};
		}
		offloadSample = curr;
	} else if (!offloadSample) {
		offloadSample = curr;
	}
	return curr.rates;
}

function lanSummary(data, fePaths) {
	var ports = (data.ports || []).filter(function(p) { return /^lan/.test(p.device || ''); });
	var upPorts = ports.filter(function(p) { return p.present && p.carrier === '1'; });
	var portMap = (fePaths && fePaths.ports) || {};
	var topLine = _('Disconnected'), subLine = _('No physical link');

	if (upPorts.length === 1) {
		var p = upPorts[0];
		var spd = Number(p.speed) > 0 ? (Number(p.speed) >= 1000 ? (Number(p.speed) / 1000).toFixed(Number(p.speed) % 1000 ? 1 : 0) + 'G' : p.speed + 'M') : _('Link Up');
		topLine = p.device + ' · ' + spd;
	} else if (upPorts.length > 1) {
		topLine = _('%d ports up').format(upPorts.length);
	}

	var activeLan = Object.keys(portMap);
	if (activeLan.length) {
		var first = activeLan[0], stat = portMap[first];
		subLine = first + ' ↑' + stat.up + ' ↓' + stat.down;
		if (activeLan.length > 1)
			subLine += ' (+' + (activeLan.length - 1) + ')';
	} else if (upPorts.length) {
		subLine = upPorts.map(function(p) { return p.device; }).slice(0, 2).join(' · ');
	}
	return { top: topLine, sub: subLine, upCount: upPorts.length };
}

function conduitTrack(dirCls, speedCls, label) {
	var ms = durationForSpeed(speedCls);
	var style = phaseStyle(ms);
	return E('div', { class: 'tyf-fe-track ' + dirCls + ' ' + speedCls }, [
		label ? E('span', { class: 'tyf-fe-track-lbl' }, [label]) : null,
		E('div', { class: 'tyf-fe-rail-line' }, [
			E('span', { class: 'tyf-fe-rail-track' }, [
				ms ? E('span', { class: 'tyf-fe-comet', style: style }) : null
			]),
			E('span', { class: 'tyf-fe-arrow-tip' })
		])
	]);
}

function verticalConduit(dirCls, colorCls, speedCls) {
	var ms = durationForSpeed(speedCls);
	var style = phaseStyle(ms);
	return E('div', { class: 'tyf-fe-vtrack ' + dirCls + ' ' + colorCls + ' ' + speedCls }, [
		E('span', { class: 'tyf-fe-vrail' }, [
			ms ? E('span', { class: 'tyf-fe-vcomet', style: style }) : null
		]),
		E('span', { class: 'tyf-fe-varrow' })
	]);
}

function cpuBridgeSvg(cpuCls, ms) {
	var svg = svgEl('svg', {
		class: 'tyf-fe-cpu-svg ' + cpuCls,
		viewBox: '0 0 600 44',
		preserveAspectRatio: 'none',
		'aria-hidden': 'true'
	});
	var style = phaseStyle(ms);
	['M 160 44 C 160 16, 188 12, 228 12', 'M 372 12 C 412 12, 440 16, 440 44'].forEach(function(d) {
		svg.appendChild(svgEl('path', { d: d, class: 'tyf-fe-cpu-rail' }));
		if (ms)
			svg.appendChild(svgEl('path', { d: d, class: 'tyf-fe-cpu-flow', style: style }));
	});
	return svg;
}

function offloadDiagram(data, software, hardware, fe, rates) {
	var available = flag(fe.available), enabled = flag(fe.enabled);
	var hwError = fe.error != null && Number(fe.error) !== 0;
	var hwReady = software && hardware && available && enabled && !hwError;
	var flows = Number(fe.flows || 0);
	var hashEntries = Number(fe.hash_entries || 65536);
	var fp = data.fe_paths || null;
	var upFlows = fp && fp.upstream ? Number(fp.upstream.flows || 0) : null;
	var downFlows = fp && fp.downstream ? Number(fp.downstream.flows || 0) : null;
	var hasUp = upFlows != null ? upFlows > 0 : flows > 0;
	var hasDown = downFlows != null ? downFlows > 0 : flows > 0;

	var upSpeed = flowSpeedCls(rates.ponTxBps, hasUp, hwReady);
	var downSpeed = flowSpeedCls(rates.ponRxBps, hasDown, hwReady);
	var cpuCls = hwReady ? 'is-subtle' : 'is-active';
	var cpuMs = hwReady ? 3200 : 1650;

	var lanInfo = lanSummary(data, fp);
	var serdes = data.serdes || {};
	var ponPort = (data.ports || []).find(function(p) { return p.device === 'pon0'; }) || {};
	var ponProto = shortModes[serdes.mode] || value(serdes.mode);
	var ponAttach = flag(fe.pon_attached) ? _('FE Attached') : _('FE Detached');
	var ponUp = ponPort.present && ponPort.carrier === '1';

	var cpuSub = hwReady ? _('First-packet flow setup to FE · Proxy / unoffloaded slow path') : software ? _('Software Flowtable only (via CPU)') : _('Standard kernel forwarding (via CPU)');
	var feStateCls = !software || !hardware ? 'is-muted' : (!available || !enabled || hwError) ? 'is-danger' : 'is-good';
	var feStatLine = !software ? _('Not Enabled') : !hardware ? _('HW Bypassed') :
		hwError ? _('Error %s').format(fe.error) :
		!available ? _('Unavailable') :
		!enabled ? _('Disabled') :
		_('%s / %s flows').format(flows, hashEntries.toLocaleString());
	var pct = hashEntries > 0 ? Math.min(100, Math.max(flows > 0 ? 4 : 0, (flows / hashEntries) * 100)) : 0;

	var upLabel = upFlows != null ? _('↑ %d flows').format(upFlows) : _('↑ Upstream');
	var downLabel = downFlows != null ? _('↓ %d flows').format(downFlows) : _('↓ Downstream');
	var bindStyle = phaseStyle(hwReady ? 2100 : 0);
	var cSlots = Number(fe.counter_slots || 32);
	var cUsed = Number(fe.counted_flows || 0);
	var slotPct = cSlots > 0 ? Math.min(100, Math.max(cUsed > 0 ? 4 : 0, (cUsed / cSlots) * 100)) : 0;
	var qmPct = hwReady ? (flag(fe.pon_attached) ? 100 : 50) : 0;
	var slotInfo = fe.counted_flows != null && fe.counter_slots != null ? _('Counters %s/%s').format(fe.counted_flows, fe.counter_slots) : 'NAT·PPPoE';

	return E('div', { class: 'tyf-fe-visual' }, [
		E('div', { class: 'tyf-fe-scroll' }, [
			E('div', { class: 'tyf-fe-board' }, [
				E('div', { class: 'tyf-fe-top-row' }, [
					cpuBridgeSvg(cpuCls, cpuMs),
					E('div', { class: 'tyf-fe-cpu-pill ' + cpuCls }, [
						E('span', { class: 'tyf-fe-cpu-name' }, 'CPU · Linux Netfilter'),
						E('span', { class: 'tyf-fe-cpu-desc' }, cpuSub)
					]),
					E('div', { class: 'tyf-fe-top-links' }, [
						E('span', { class: 'tyf-fe-top-tag' }, hwReady ? _('Slow-path DMA RX') : _('CPU RX')),
						E('div', { class: 'tyf-fe-bind ' + (hwReady ? 'is-active' : 'is-muted') }, [
							E('span', { class: 'tyf-fe-bind-line' }, [
								hwReady ? E('span', { class: 'tyf-fe-bind-dot', style: bindStyle }) : null
							]),
							E('span', { class: 'tyf-fe-bind-txt' }, hwReady ? _('Offload flows to FE') : _('HW Offload Off'))
						]),
						E('span', { class: 'tyf-fe-top-tag' }, hwReady ? _('Slow-path TX') : _('CPU TX'))
					])
				]),
				E('div', { class: 'tyf-fe-arch-grid' }, [
					E('div', { class: 'tyf-fe-node tyf-fe-endpoint ' + (lanInfo.upCount ? 'is-up' : '') }, [
						E('div', { class: 'tyf-fe-node-head' }, [E('i', { class: 'tyf-fe-ndot' }), _('LAN Ports')]),
						E('div', { class: 'tyf-fe-node-val' }, lanInfo.top),
						E('div', { class: 'tyf-fe-node-sub' }, lanInfo.sub)
					]),
					E('div', { class: 'tyf-fe-conduit' }, [
						conduitTrack('is-up is-ltr', upSpeed, upLabel),
						conduitTrack('is-down is-rtl', downSpeed, '← LAN')
					]),
					E('div', { class: 'tyf-fe-soc ' + feStateCls }, [
						E('div', { class: 'tyf-fe-soc-head' }, [
							E('span', { class: 'tyf-fe-soc-title' }, _('RTL9617C Hardware Offload Engine Data Path')),
							E('span', { class: 'tyf-fe-core-chip' }, hwReady ? _('CPU Bypass') : _('Bypassed'))
						]),
						E('div', { class: 'tyf-fe-core-row' }, [
							E('div', { class: 'tyf-fe-mod is-fe ' + feStateCls }, [
								E('div', { class: 'tyf-fe-mod-top' }, [
									E('span', { class: 'tyf-fe-mod-name' }, _('FE Forwarding')),
									E('span', { class: 'tyf-fe-mod-tag' }, 'L2/L3')
								]),
								E('div', { class: 'tyf-fe-mod-sub' }, _('64K Hash Flow Lookup')),
								E('div', { class: 'tyf-fe-cap-bar' }, [
									E('span', { class: 'tyf-fe-cap-fill ' + feStateCls, style: 'width:' + pct.toFixed(1) + '%' })
								]),
								E('div', { class: 'tyf-fe-mod-meta' }, feStatLine)
							]),
							E('div', { class: 'tyf-fe-dual-link' }, [
								conduitTrack('is-up is-ltr', upSpeed, null),
								conduitTrack('is-down is-ltr', downSpeed, null)
							]),
							E('div', { class: 'tyf-fe-mod is-pe ' + feStateCls }, [
								E('div', { class: 'tyf-fe-mod-top' }, [
									E('span', { class: 'tyf-fe-mod-name' }, _('PE Packet Edit')),
									E('span', { class: 'tyf-fe-mod-tag' }, _('Rewrite'))
								]),
								E('div', { class: 'tyf-fe-mod-sub' }, 'NAT / PPPoE / VLAN'),
								E('div', { class: 'tyf-fe-cap-bar' }, [
									E('span', { class: 'tyf-fe-cap-fill ' + feStateCls, style: 'width:' + slotPct.toFixed(1) + '%' })
								]),
								E('div', { class: 'tyf-fe-mod-meta' }, _('Checksum · %s').format(slotInfo))
							]),
							E('div', { class: 'tyf-fe-dual-link' }, [
								conduitTrack('is-up is-ltr', upSpeed, null),
								conduitTrack('is-down is-ltr', downSpeed, null)
							]),
							E('div', { class: 'tyf-fe-mod is-qm ' + feStateCls }, [
								E('div', { class: 'tyf-fe-mod-top' }, [
									E('span', { class: 'tyf-fe-mod-name' }, _('QM Queue Mgr')),
									E('span', { class: 'tyf-fe-mod-tag' }, 'DeepQ')
								]),
								E('div', { class: 'tyf-fe-mod-sub' }, 'VoQ · EQ0+EQ8'),
								E('div', { class: 'tyf-fe-cap-bar' }, [
									E('span', { class: 'tyf-fe-cap-fill ' + feStateCls, style: 'width:' + qmPct + '%' })
								]),
								E('div', { class: 'tyf-fe-mod-meta' }, _('Burst Buffer · TX'))
							])
						]),
						E('div', { class: 'tyf-fe-bus-links' }, [
							E('div', { class: 'tyf-fe-vpair' }, [
								verticalConduit('is-btt', 'is-up', upSpeed),
								verticalConduit('is-btt', 'is-down', downSpeed),
								E('span', { class: 'tyf-fe-vlabel' }, _('Demux to FE'))
							]),
							E('div', { class: 'tyf-fe-vpair' }, [
								verticalConduit('is-ttb', 'is-up', upSpeed),
								verticalConduit('is-ttb', 'is-down', downSpeed),
								E('span', { class: 'tyf-fe-vlabel' }, _('Dequeue to NI'))
							])
						]),
						E('div', { class: 'tyf-fe-ni-bus ' + feStateCls }, [
							E('span', { class: 'tyf-fe-mod-name' }, _('NI Network Interface')),
							E('span', { class: 'tyf-fe-ni-desc' }, _('MAC · DMA · L3FE Demux (aggregates LAN/PON RX/TX, connects directly to FE / QM / CPU)'))
						])
					]),
					E('div', { class: 'tyf-fe-conduit' }, [
						conduitTrack('is-up is-ltr', upSpeed, 'PON →'),
						conduitTrack('is-down is-rtl', downSpeed, downLabel)
					]),
					E('div', { class: 'tyf-fe-node tyf-fe-endpoint ' + (ponUp ? 'is-up' : '') }, [
						E('div', { class: 'tyf-fe-node-head' }, [E('i', { class: 'tyf-fe-ndot' }), _('PON Port')]),
						E('div', { class: 'tyf-fe-node-val' }, ponProto),
						E('div', { class: 'tyf-fe-node-sub' }, ponAttach + ' · PDC/PUC')
					])
				])
			])
		]),
		E('div', { class: 'tyf-fe-legend' }, [
			E('span', { class: 'tyf-fe-leg-item' }, [E('i', { class: 'tyf-fe-swatch is-up' }), _('Upstream Fast Path: LAN → NI → FE → PE → QM → NI → PON')]),
			E('span', { class: 'tyf-fe-leg-item' }, [E('i', { class: 'tyf-fe-swatch is-down' }), _('Downstream Fast Path: PON → NI → FE → PE → QM(DeepQ) → NI → LAN')]),
			E('span', { class: 'tyf-fe-leg-item' }, [E('i', { class: 'tyf-fe-swatch is-cpu' }), _('CPU Slow Path & Flow Setup')])
		])
	]);
}

function entropyInfo(data) {
	var ent = (data && data.entropy) || {};
	var current = ent.current;
	var active = flag(ent.active) || !!(current && current !== 'none' && current !== 'unavailable');
	var sources = Array.isArray(ent.available)
		? ent.available.filter(function(item) { return item && item !== 'none'; })
		: [];
	var availBits = ent.entropy_avail != null && isFinite(Number(ent.entropy_avail))
		? Number(ent.entropy_avail) : null;
	var poolBits = ent.poolsize != null && isFinite(Number(ent.poolsize))
		? Number(ent.poolsize) : null;
	var quality = ent.quality != null && isFinite(Number(ent.quality))
		? Number(ent.quality) : null;

	return {
		active: active,
		current: active ? String(current) : 'unavailable',
		sources: sources,
		availBits: availBits,
		poolBits: poolBits,
		quality: quality,
		tone: active ? 'good' : (sources.length ? 'warn' : 'muted'),
		badgeText: active ? _('Active') : 'unavailable'
	};
}

function entropyCard(data) {
	var info = entropyInfo(data);
	var poolStr = info.availBits == null ? 'unavailable' :
		(info.poolBits != null ? (info.availBits + ' / ' + info.poolBits + ' bits') : (info.availBits + ' bits'));

	return card(_('Hardware Entropy (TRNG)'), badge(info.badgeText, info.tone), [
		rows([
			[_('Current Source'), info.current],
			[_('Available Hardware Sources'), info.sources.length ? info.sources.join(', ') : 'unavailable'],
			[_('Kernel Entropy Pool'), poolStr],
			[_('Entropy Quality'), info.quality != null ? String(info.quality) : (info.active ? '—' : 'unavailable')]
		]),
		E('p', { class: 'tyf-note' }, info.active
			? _('Hardware TRNG is active and continuously feeding the kernel RNG pool.')
			: _('Hardware entropy is inactive (shown as unavailable); the kernel continues using its software entropy pool.'))
	]);
}

function flowTypeLabel(row) {
	var base = row.k === 'bridge' || row.l ? _('L2 Bridge') : (String(row.k || '').toUpperCase() || '—');
	var tags = [];
	[row.encap, row.proto].forEach(function(item) {
		if (!item) return;
		var label = String(item).toUpperCase();
		if (label !== base && tags.indexOf(label) === -1)
			tags.push(label);
	});
	return tags.length ? (base + ' · ' + tags.join('/')) : base;
}

function flowCosLabel(row) {
	var parts = [];
	if (row.cos != null && isFinite(Number(row.cos)))
		parts.push(row.cs === true ? _('CoS %s (Explicit)').format(row.cos) : ('CoS ' + row.cos));
	else if (row.q != null && isFinite(Number(row.q)))
		parts.push('Q' + row.q);
	else if (row.prio != null && isFinite(Number(row.prio)))
		parts.push('P' + row.prio);
	if (row.dq === true)
		parts.push('DeepQ');
	return parts.length ? parts.join(' · ') : '—';
}

function flowPolicerLabel(row) {
	if (row.pol == null || !isFinite(Number(row.pol)) || Number(row.pol) < 0)
		return '—';
	return (row.host === true ? 'Host #' : 'Flow #') + row.pol;
}

function offloadFlowsTable(fp) {
	var list = (fp && fp.entries) || [];
	var total = (fp && fp.total_entries != null) ? fp.total_entries : list.length;
	var title = list.length
		? (total > list.length
			? _('Inspect Hardware Flow Table (first %d of %d entries)').format(list.length, total)
			: _('Inspect Hardware Flow Table (%d entries)').format(list.length))
		: _('Inspect Hardware Flow Table (no active flows)');

	return E('details', { class: 'tyf-fe-details', 'data-tyf-fold': 'fe-flows' }, [
		E('summary', {}, title),
		list.length ? E('div', { class: 'tyf-fe-table-wrap' }, [
			E('table', { class: 'tyf-fe-table' }, [
				E('thead', {}, E('tr', {}, [
					E('th', {}, _('Type')),
					E('th', {}, _('Path')),
					E('th', {}, _('CoS / Queue')),
					E('th', {}, _('Policer')),
					E('th', {}, _('Hash Slot')),
					E('th', {}, _('Counter Slot')),
					E('th', {}, _('Hit Packets')),
					E('th', {}, _('Hit Bytes'))
				])),
				E('tbody', {}, list.map(function(row) {
					var activeStat = row.p > 0 || row.b > 0;
					return E('tr', {}, [
						E('td', {}, flowTypeLabel(row)),
						E('td', {}, value(row.in) + ' → ' + value(row.out)),
						E('td', {}, flowCosLabel(row)),
						E('td', {}, flowPolicerLabel(row)),
						E('td', {}, value(row.h)),
						E('td', {}, activeStat ? ('#' + value(row.c)) : _('Active (Tracked)')),
						E('td', {}, activeStat ? String(row.p) : '—'),
						E('td', {}, activeStat ? formatBytes(row.b) : '—')
					]);
				}))
			]),
			E('p', { class: 'tyf-note' }, _('Hardware allocates dedicated exact counters for up to 32 interface/flow combinations; remaining flows shown as "Active (Tracked)" are also forwarded at line rate by the FE chip. The CoS / Queue column is backward-compatible with kernel flowtable exports (shows — when absent). To inspect plaintext IP/port 5-tuples (including [HW_OFFLOAD] markers), go to "Status → Realtime Graphs → Connections".'))
		]) : E('p', { class: 'tyf-note' }, _('The FE hardware flow table is currently empty, or the debug interface returned no entries.'))
	]);
}

function offloadState(software, hardware, fe) {
	var available = flag(fe.available), enabled = flag(fe.enabled);
	var bindings = fe.bindings == null ? null : Number(fe.bindings);

	if (!software)
		return [_('Disabled'), 'muted', _('Firewall flow offloading is disabled; all forwarding runs on the CPU')];
	if (!hardware)
		return [_('Software Only'), 'muted', _('Hardware offloading is disabled; traffic is forwarded via CPU software flowtable')];
	if (fe.error != null && Number(fe.error) !== 0)
		return [_('Error'), 'danger', _('Error code: %s').format(fe.error)];
	if (!available)
		return [_('HW Unavailable'), 'danger', _('Hardware offloading is requested, but the driver does not provide FE')];
	if (!enabled)
		return [_('HW Not Ready'), 'danger', _('Hardware offloading is requested, but the FE engine is not enabled')];
	if (!bindings)
		return [_('Enabled'), 'good', _('FE engine is ready; no interfaces are bound for offloading yet')];
	return [_('Enabled'), 'good', null];
}

function offloadCard(data, software, hardware) {
	data = data || {};
	var fe = data.fe || {};
	var fp = data.fe_paths || null;
	var res = data.fe_resources || null;
	var bindings = fe.bindings == null ? null : Number(fe.bindings);
	var state = offloadState(software, hardware, fe);
	var rates = sampleRates(data);

	var txRateStr = formatRate(rates.ponTxBps);
	var rxRateStr = formatRate(rates.ponRxBps);
	var upText = fp && fp.upstream
		? (_('%d flows').format(fp.upstream.flows) + (txRateStr ? ' · ' + txRateStr : '') + (fp.upstream.bytes > 0 ? ' (' + _('Counter %s').format(formatBytes(fp.upstream.bytes)) + ')' : ''))
		: (txRateStr ? txRateStr : _('Sampling…'));
	var downText = fp && fp.downstream
		? (_('%d flows').format(fp.downstream.flows) + (rxRateStr ? ' · ' + rxRateStr : '') + (fp.downstream.bytes > 0 ? ' (' + _('Counter %s').format(formatBytes(fp.downstream.bytes)) + ')' : ''))
		: (rxRateStr ? rxRateStr : _('Sampling…'));

	var protoParts = [];
	if (fp && fp.upstream && fp.downstream) {
		var v4 = Number(fp.upstream.ipv4 || 0) + Number(fp.downstream.ipv4 || 0);
		var v6 = Number(fp.upstream.ipv6 || 0) + Number(fp.downstream.ipv6 || 0);
		var gre = Number(fp.upstream.gre || 0) + Number(fp.downstream.gre || 0) + Number((fp.bridge || {}).gre || 0);
		var other = Number(fp.upstream.other || 0) + Number(fp.downstream.other || 0);
		protoParts.push('IPv4 ' + v4, 'IPv6 ' + v6);
		if (gre > 0) protoParts.push('GRE ' + gre);
		if (other > 0) protoParts.push(_('Other %d').format(other));
	}
	var protoDetail = protoParts.length ? protoParts.join(' · ') : null;
	var slotDetail = fe.counted_flows != null && fe.counter_slots != null
		? _('Counters %s/%s').format(fe.counted_flows, fe.counter_slots) : null;
	var flowDetail = [
		value(fe.flows) + ' / ' + value(fe.hash_entries || 65536),
		bindings == null ? null : _('Bound %d').format(bindings),
		protoDetail,
		slotDetail,
		Number(fe.bridge_flows || 0) > 0 ? _('Bridge %d').format(fe.bridge_flows) : null
	].filter(Boolean).join(' · ');

	var cosSummary = null;
	if (fp && fp.cos && fp.cos.active > 0) {
		var qDist = Object.keys(fp.cos.queues || {}).sort().map(function(q) {
			return 'CoS' + q + '×' + fp.cos.queues[q];
		}).slice(0, 6).join(' · ');
		cosSummary = (fp.cos.explicit > 0 ? (_('Explicit %d').format(fp.cos.explicit) + ' · ') : (_('Default / OLT Queue') + ' · ')) +
			(qDist || _('%d tagged').format(fp.cos.active));
	}

	var resSummary = res ? [
		res.interface ? ('EIF ' + res.interface.used + '/' + res.interface.total) : null,
		res.mtu ? _('MTU Slots %s/%s').format(res.mtu.used, res.mtu.total) : null,
		res.source_mac ? ('SMAC ' + res.source_mac.used + '/' + res.source_mac.total) : null
	].filter(Boolean).join(' · ') : null;

	var factRows = [
		[_('Offload Mode'), (software ? _('SW On') : _('SW Off')) + ' / ' + (hardware ? _('HW On') : _('HW Off')) + ' · FE ' + (flag(fe.available) ? flag(fe.enabled) ? _('Enabled') : _('Disabled') : _('Unavailable'))],
		[_('Active HW Flows'), flowDetail],
		[_('Up / Down Paths'), '↑ ' + upText + '  |  ↓ ' + downText]
	];
	if (cosSummary)
		factRows.push([_('CoS Queue Distribution'), cosSummary]);
	else if (fp != null)
		factRows.push([_('CoS / Queue Parsing'), _('8-VoQ compatible (CoS field absent in current flow table)')]);
	if (resSummary)
		factRows.push([_('HW Table Slots'), resSummary]);

	return card(_('Hardware Offload'), badge(state[0], state[1]), E('div', {}, [
		offloadDiagram(data, software, hardware, fe, rates),
		rows(factRows),
		state[2] ? E('p', { class: 'tyf-note' }, state[2]) : null,
		offloadFlowsTable(fp)
	]));
}

return baseclass.extend({
	modes: modes, value: value, flag: flag, badge: badge, rows: rows, card: card,
	temperature: temperature, voltage: voltage, power: power, opticalRows: opticalRows, bosaName: bosaName,
	omciLive: omciLive, ponState: ponState, ponCard: ponCard, offloadCard: offloadCard,
	entropyInfo: entropyInfo, entropyCard: entropyCard,
	style: function() { return E('link', { rel: 'stylesheet', href: L.resource('rtl9617c/status.css') + '?v=20261126c' }); },
	callStatus: callStatus
});
