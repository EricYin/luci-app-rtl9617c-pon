'use strict';
'require view';
'require form';
'require rpc';
'require poll';
'require uci';

var callStatus = rpc.declare({
	object: 'luci.rtl9617c-system',
	method: 'status',
	expect: { '': {} },
	reject: true
});

var GOV_LABELS = {
	schedutil: _('Dynamic (schedutil, recommended: cool at idle, scales to 1200 MHz under load)'),
	performance: _('Performance (performance, locked at max 1200 MHz)'),
	ondemand: _('On-Demand (ondemand, scales dynamically with load)'),
	conservative: _('Conservative (conservative, gradual frequency scaling)'),
	powersave: _('Power Save (powersave, locked at minimum frequency)'),
	userspace: _('Fixed Frequency (userspace, manual target frequency)')
};

var GOV_SHORT = {
	schedutil: _('Dynamic (schedutil)'),
	performance: _('Performance (performance)'),
	ondemand: _('On-Demand (ondemand)'),
	conservative: _('Conservative (conservative)'),
	powersave: _('Power Save (powersave)'),
	userspace: _('Fixed Frequency (userspace)')
};

var DYNAMIC_GOVS = ['schedutil', 'ondemand', 'conservative'];

var CPU_CSS = [
	'.rtlcpu{--rc-accent:var(--v-accent-text,var(--primary,var(--primary-color-high,#5e72e4)));--rc-accent-fill:var(--v-accent-fill,var(--primary,var(--primary-color-high,#5e72e4)));--rc-accent-ink:var(--v-accent-fill-ink,var(--text-on-accent,var(--on-primary-color,#ffffff)));--rc-accent-line:var(--v-accent-line,var(--primary,var(--primary-color-high,#5e72e4)));--rc-chart-up:var(--v-chart-2,#825ee4);--rc-cool-b:var(--v-chart-4,#2dcecc);--rc-good:var(--v-ok,var(--success,var(--success-color-high,#2dce89)));--rc-warn:var(--v-warn,var(--warning,var(--warn-color-high,#fb6340)));--rc-danger:var(--v-err,var(--danger,var(--error-color-high,#f5365c)));--rc-border:var(--v-line,var(--border-color,var(--border-color-medium,#dee2e6)));--rc-border-soft:transparent;--rc-muted:var(--v-text-3,var(--muted-text,var(--text-color-medium,#626f80)));--rc-surface:var(--v-surface,var(--surface-color,var(--background-color-high,#fff)));--rc-inset:var(--v-surface-3,var(--surface-muted,var(--background-color-low,#f6f9fc)));--rc-text:var(--v-text,var(--text-strong,var(--text-color-highest,#32325d)));--rc-shadow:var(--v-shadow,var(--section-shadow,0 3px 12px rgba(20,32,60,.035)));--rc-radius:var(--v-r-lg,var(--radius-card,12px));color:var(--rc-text);font-family:var(--v-font,inherit);min-width:0}',
	'html[data-vt-look-theme] .rtlcpu{--rc-border-soft:var(--v-line)}',
	'.rtlcpu *,.rtlcpu *::before,.rtlcpu *::after{box-sizing:border-box}',
	'@media (prefers-color-scheme:dark){:root:not([data-argon-mode="light"]):not([data-darkmode="false"]) .rtlcpu{--rc-border:var(--v-line,var(--border-color,#3c3c3c));--rc-muted:var(--v-text-3,var(--muted-text,#adb5bd));--rc-surface:var(--v-surface,var(--surface-color,#252526));--rc-inset:var(--v-surface-3,var(--surface-muted,#2d2d2d));--rc-text:var(--v-text,var(--text-strong,#e6e6e6));--rc-shadow:var(--v-shadow,var(--section-shadow,0 3px 12px rgba(0,0,0,.35)))}}',
	':root[data-darkmode="true"] .rtlcpu,:root[data-argon-mode="dark"] .rtlcpu{--rc-border:var(--v-line,var(--border-color,#3c3c3c));--rc-muted:var(--v-text-3,var(--muted-text,#adb5bd));--rc-surface:var(--v-surface,var(--surface-color,#252526));--rc-inset:var(--v-surface-3,var(--surface-muted,#2d2d2d));--rc-text:var(--v-text,var(--text-strong,#e6e6e6));--rc-shadow:var(--v-shadow,var(--section-shadow,0 3px 12px rgba(0,0,0,.35)))}',
	'.rtlcpu .rc-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;margin:6px 0 18px}',
	'.rtlcpu .rc-header h2{margin:0 0 6px;padding:0;border:0;font-size:var(--v-fs-2xl,24px);font-weight:600;background:none;box-shadow:none;width:auto;color:var(--rc-text);line-height:1.25}',
	'.rtlcpu .rc-header h2.vt-repeat{position:static!important;width:auto!important;height:auto!important;min-height:0!important;margin:0 0 6px!important;overflow:visible!important;clip-path:none!important;white-space:normal!important}',
	'html[data-vt-look-theme] .rtlcpu .rc-header h2{letter-spacing:-.02em;line-height:1.2}',
	'.rtlcpu .rc-eyebrow{color:var(--rc-accent);font-size:var(--v-fs-micro,11px);font-weight:600;letter-spacing:.12em;margin:0 0 4px;text-transform:uppercase}',
	'.rtlcpu .rc-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px}',
	'.rtlcpu .rc-controls .cbi-button{display:inline-flex;align-items:center;justify-content:center;height:auto;min-height:var(--v-ctl-h,34px);line-height:1.35;white-space:nowrap}',
	'.rtlcpu .rc-updated{font-size:12px;color:var(--rc-muted);font-variant-numeric:tabular-nums}',
	'.rtlcpu .rc-card{min-width:0;padding:var(--v-card-py,18px) var(--v-card-px,20px);border:1px solid var(--rc-border);border-radius:var(--rc-radius);background:var(--rc-surface);box-shadow:var(--rc-shadow);margin-bottom:18px}',
	'.rtlcpu .rc-hero{border-top:3px solid var(--rc-accent)}',
	'.rtlcpu .rc-hero[data-tone="good"]{border-top-color:var(--rc-good)}',
	'.rtlcpu .rc-hero[data-tone="warn"]{border-top-color:var(--rc-warn)}',
	'.rtlcpu .rc-hero[data-tone="danger"]{border-top-color:var(--rc-danger)}',
	'.rtlcpu .rc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;margin:0 0 18px}',
	'.rtlcpu .rc-grid .rc-card{margin-bottom:0;display:flex;flex-direction:column}',
	'.rtlcpu .rc-card-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px 10px;margin-bottom:12px}',
	'.rtlcpu .rc-card-head h3{margin:0;padding:0;border:0;font-size:var(--v-fs-md,15px);font-weight:600;background:none;box-shadow:none;width:auto;flex:1 1 160px;min-width:0;line-height:1.4;color:var(--rc-text)}',
	'.rtlcpu .rc-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:var(--v-r,6px);background:var(--rc-inset);border:1px solid var(--rc-border-soft);color:var(--rc-text);font-size:12px;line-height:1.4;flex-shrink:0;white-space:nowrap;max-width:100%}',
	'.rtlcpu .rc-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--rc-muted)}',
	'.rtlcpu .rc-good::before{background:var(--rc-good)}',
	'.rtlcpu .rc-warn::before{background:var(--rc-warn)}',
	'.rtlcpu .rc-danger::before{background:var(--rc-danger)}',
	'.rtlcpu .rc-kpi{font-size:22px;font-weight:600;margin:4px 0 8px;font-variant-numeric:tabular-nums;line-height:1.3;color:var(--rc-text)}',
	'.rtlcpu .rc-note{color:var(--rc-muted);font-size:12px;line-height:1.65;margin:8px 0 0}',
	'.rtlcpu .rc-freq-row{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:2px 0 12px}',
	'.rtlcpu .rc-freq-main{display:inline-flex;align-items:baseline;gap:8px;font-variant-numeric:tabular-nums}',
	'.rtlcpu .rc-freq-val{font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1.2;color:var(--rc-text)}',
	'.rtlcpu .rc-freq-cap{font-size:13px;color:var(--rc-muted);font-weight:500}',
	'.rtlcpu .rc-freq-pct{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;padding:3px 10px;border-radius:99px;background:var(--rc-inset);border:1px solid var(--rc-border-soft);color:var(--rc-accent)}',
	'.rtlcpu .rc-freq-pct.is-cool{color:var(--rc-good)}',
	'.rtlcpu .rc-freq-pct.is-peak{color:var(--rc-warn)}',
	'.rtlcpu .rc-freq-track{width:100%;height:12px;border-radius:99px;background:var(--rc-inset);border:1px solid var(--rc-border);overflow:hidden;margin:4px 0 12px}',
	'.rtlcpu .rc-freq-fill{display:block;height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,var(--rc-accent-fill),var(--rc-chart-up));transition:width .35s ease,background .35s ease}',
	'.rtlcpu .rc-freq-fill.is-cool{background:linear-gradient(90deg,var(--rc-good),var(--rc-cool-b))}',
	'.rtlcpu .rc-freq-fill.is-peak{background:linear-gradient(90deg,var(--rc-accent-fill),var(--rc-warn))}',
	'.rtlcpu .rc-opp-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:6px;margin:4px 0 6px}',
	'.rtlcpu .rc-opp-pill{text-align:center;padding:4px 6px;border-radius:var(--v-r,6px);border:1px solid var(--rc-border);background:var(--rc-inset);font-size:11px;font-variant-numeric:tabular-nums;color:var(--rc-muted);transition:all .25s ease}',
	'.rtlcpu .rc-opp-pill.is-active{border-color:var(--rc-accent-line);background:var(--rc-accent-fill);color:var(--rc-accent-ink);font-weight:600;box-shadow:0 2px 6px rgba(94,114,228,.28);box-shadow:0 2px 6px color-mix(in srgb,var(--rc-accent-line) 28%,transparent)}',
	'.rtlcpu .rc-opp-pill.is-out{opacity:.42;border-style:dashed}',
	'.rtlcpu .rc-meter{width:100%;height:7px;border-radius:99px;background:var(--rc-inset);overflow:hidden;margin:8px 0}',
	'.rtlcpu .rc-meter>span{display:block;height:100%;width:0%;border-radius:99px;background:var(--rc-good);transition:width .35s ease,background .35s ease}',
	'.rtlcpu .rc-meter.is-warn>span{background:var(--rc-warn)}',
	'.rtlcpu .rc-meter.is-danger>span{background:var(--rc-danger)}',
	'.rtlcpu .rc-form .cbi-section{border-radius:var(--rc-radius)}',
	'@media (max-width:720px){.rtlcpu .rc-header{gap:10px;margin:4px 0 14px}.rtlcpu .rc-header h2,.rtlcpu .rc-header h2.vt-repeat{font-size:var(--v-fs-xl,20px)}.rtlcpu .rc-controls{width:100%;justify-content:space-between;gap:8px}.rtlcpu .rc-controls .rc-updated{width:100%}.rtlcpu .rc-controls .cbi-button{flex:1 1 110px;min-height:var(--v-ctl-h,36px)}.rtlcpu .rc-grid{gap:12px;margin-bottom:14px}.rtlcpu .rc-card{padding:14px;border-radius:var(--v-r-lg,10px);margin-bottom:14px}.rtlcpu .rc-card-head h3{font-size:14px;flex-basis:100%}.rtlcpu .rc-badge{white-space:normal}.rtlcpu .rc-kpi{font-size:19px}.rtlcpu .rc-freq-val{font-size:23px}html[data-argon-mode] .rtlcpu .rc-form .cbi-value{display:flex;flex-direction:column;align-items:stretch;padding:10px 0}html[data-argon-mode] .rtlcpu .rc-form .cbi-value-title{float:none!important;width:auto!important;max-width:100%!important;text-align:left!important;padding:0 0 6px!important}html[data-argon-mode] .rtlcpu .rc-form .cbi-value-field{margin-left:0!important;width:100%!important}html[data-argon-mode] .rtlcpu .rc-form .cbi-value-field select,html[data-argon-mode] .rtlcpu .rc-form .cbi-value-field input:not([type="checkbox"]):not([type="radio"]):not(.cbi-button){width:100%!important;max-width:100%!important}}',
	'@media (max-width:480px){.rtlcpu .rc-card{padding:12px}.rtlcpu .rc-opp-strip{grid-template-columns:repeat(3,minmax(0,1fr))}}'
].join('\n');

function ensureCss() {
	var id = 'rtl9617c-cpu-css';
	if (document.getElementById(id))
		return;
	document.head.appendChild(E('style', { id: id }, [CPU_CSS]));
}

function frequency(value) {
	return value == null ? _('Not provided') : (value / 1000) + ' MHz';
}

function setBadge(el, text, tone) {
	el.className = 'rc-badge' + (tone ? ' rc-' + tone : '');
	el.textContent = text;
}

function makeCard(title, badgeEl, body, extraClass) {
	return E('section', { class: 'rc-card' + (extraClass ? ' ' + extraClass : '') }, [
		E('div', { class: 'rc-card-head' }, [
			E('h3', {}, [title]),
			badgeEl || E('span')
		]),
		E('div', {}, body)
	]);
}

return view.extend({
	load: function() {
		return Promise.all([uci.load('system'), callStatus()]);
	},

	render: function(data) {
		ensureCss();
		var state = data[1] || {};
		var cpu = state.cpu || {};
		var availKhz = cpu.available_khz || [];
		var availGovs = (cpu.available_governors && cpu.available_governors.length)
			? cpu.available_governors : (cpu.governor ? [cpu.governor] : ['userspace']);
		var minOpp = availKhz.length ? String(availKhz[0]) : '400000';
		var maxOpp = availKhz.length ? String(availKhz[availKhz.length - 1]) : '1200000';
		var maxOppKhz = Number(maxOpp) || 1200000;

		var updatedEl = E('span', { class: 'rc-updated' }, [_('Loading…')]);
		var alertEl = E('p', { class: 'alert-message warning', role: 'status', hidden: true });
		var paused = false;
		var pending = null;

		var heroBadge = E('span', { class: 'rc-badge' }, [_('Loading')]);
		var freqValEl = E('span', { class: 'rc-freq-val' }, ['—']);
		var freqCapEl = E('span', { class: 'rc-freq-cap' }, ['/ ' + frequency(maxOppKhz)]);
		var freqPctEl = E('span', { class: 'rc-freq-pct' }, ['0%']);
		var freqFillEl = E('span', { class: 'rc-freq-fill' });
		var freqTrackEl = E('div', { class: 'rc-freq-track', title: _('Loading…') }, [freqFillEl]);
		var oppPills = availKhz.map(function(khz) {
			return {
				khz: Number(khz),
				el: E('span', { class: 'rc-opp-pill' }, [String(khz / 1000) + ' MHz'])
			};
		});
		var oppStripEl = oppPills.length
			? E('div', { class: 'rc-opp-strip' }, oppPills.map(function(p) { return p.el; }))
			: null;
		var freqNoteEl = E('p', { class: 'rc-note' }, [_('Quad-core Cortex-A55 shared clock domain')]);
		var heroCard = makeCard(_('Live CPU Frequency'), heroBadge, [
			E('div', { class: 'rc-freq-row' }, [
				E('div', { class: 'rc-freq-main' }, [freqValEl, freqCapEl]),
				freqPctEl
			]),
			freqTrackEl,
			oppStripEl,
			freqNoteEl
		], 'rc-hero');

		var tempBadge = E('span', { class: 'rc-badge' }, [_('Loading')]);
		var tempKpi = E('div', { class: 'rc-kpi' }, ['—']);
		var tempFill = E('span');
		var tempMeter = E('div', { class: 'rc-meter' }, [tempFill]);
		var tempNote = E('p', { class: 'rc-note' }, [_('Real-time sampling from on-chip cpu-thermal sensor; < 75 °C recommended for daily operation.')]);
		var tempCard = makeCard(_('Live SoC Temperature'), tempBadge, [tempKpi, tempMeter, tempNote]);

		var govBadge = E('span', { class: 'rc-badge' }, [_('Loading')]);
		var govKpi = E('div', { class: 'rc-kpi' }, ['—']);
		var govNote = E('p', { class: 'rc-note' }, ['']);
		var govCard = makeCard(_('Active Governor'), govBadge, [govKpi, govNote]);

		var stateBadge = E('span', { class: 'rc-badge' }, [_('Loading')]);
		var stateKpi = E('div', { class: 'rc-kpi' }, ['—']);
		var stateNote = E('p', { class: 'rc-note' }, ['']);
		var stateCard = makeCard(_('Configuration Status'), stateBadge, [stateKpi, stateNote]);

		function update(next) {
			var nc = (next && next.cpu) || {};
			var gov = nc.governor || '';
			var isDyn = DYNAMIC_GOVS.indexOf(gov) >= 0;
			var now = new Date();
			updatedEl.textContent = _('Updated %s · 2s refresh').format(now.toTimeString().slice(0, 8));
			alertEl.hidden = true;

			if (nc.current_khz != null && maxOppKhz > 0) {
				var curKhz = Number(nc.current_khz);
				var pct = Math.max(0, Math.min(100, Math.round((curKhz / maxOppKhz) * 100)));
				var levelCls = pct <= 60 ? 'is-cool' : (pct > 88 ? 'is-peak' : '');
				freqValEl.textContent = frequency(curKhz);
				freqPctEl.textContent = pct + '%';
				freqPctEl.className = 'rc-freq-pct' + (levelCls ? ' ' + levelCls : '');
				freqFillEl.style.width = pct + '%';
				freqFillEl.className = 'rc-freq-fill' + (levelCls ? ' ' + levelCls : '');
				freqTrackEl.setAttribute('title', frequency(curKhz) + ' / ' + frequency(maxOppKhz) + ' (' + pct + '%)');
				oppPills.forEach(function(p) {
					var cls = 'rc-opp-pill';
					if (p.khz === curKhz)
						cls += ' is-active';
					else if (isDyn && nc.min_khz != null && nc.max_khz != null &&
						(p.khz < Number(nc.min_khz) || p.khz > Number(nc.max_khz)))
						cls += ' is-out';
					p.el.className = cls;
				});
			} else {
				freqValEl.textContent = _('Not provided');
				freqPctEl.textContent = '—';
				freqPctEl.className = 'rc-freq-pct';
				freqFillEl.style.width = '0%';
				freqFillEl.className = 'rc-freq-fill';
				freqTrackEl.setAttribute('title', _('Not provided'));
				oppPills.forEach(function(p) { p.el.className = 'rc-opp-pill'; });
			}

			if (gov === 'userspace') {
				setBadge(heroBadge, _('Fixed · userspace'), 'good');
				heroCard.setAttribute('data-tone', '');
				freqNoteEl.textContent = _('Current manual frequency: %s · Quad-core Cortex-A55 shared clock domain.').format(frequency(nc.setspeed_khz != null ? nc.setspeed_khz : nc.current_khz));
			} else if (gov) {
				setBadge(heroBadge, (isDyn ? _('Dynamic · %s') : _('Governor · %s')).format(gov), 'good');
				heroCard.setAttribute('data-tone', isDyn ? 'good' : '');
				freqNoteEl.textContent = (nc.min_khz != null && nc.max_khz != null)
					? _('Active range: %s ~ %s · Quad-core Cortex-A55 shared clock domain.').format(frequency(nc.min_khz), frequency(nc.max_khz))
					: _('Quad-core Cortex-A55 shared clock domain.');
			} else {
				setBadge(heroBadge, _('Driver Not Ready'), 'muted');
				heroCard.setAttribute('data-tone', 'warn');
				freqNoteEl.textContent = _('No cpufreq policy interface detected.');
			}

			if (next && next.temperature_mC != null) {
				var tempC = Number(next.temperature_mC) / 1000;
				var tempPct = Math.max(0, Math.min(100, Math.round((tempC / 105) * 100)));
				tempKpi.textContent = tempC.toFixed(1) + ' °C';
				tempFill.style.width = tempPct + '%';
				if (tempC >= 85) {
					setBadge(tempBadge, _('High Temperature'), 'danger');
					tempMeter.className = 'rc-meter is-danger';
				} else if (tempC >= 70) {
					setBadge(tempBadge, _('Elevated Temp'), 'warn');
					tempMeter.className = 'rc-meter is-warn';
				} else {
					setBadge(tempBadge, _('Normal'), 'good');
					tempMeter.className = 'rc-meter';
				}
				tempMeter.setAttribute('title', _('%s °C / 105 °C passive thermal threshold').format(tempC.toFixed(1)));
			} else {
				tempKpi.textContent = _('Not provided');
				tempFill.style.width = '0%';
				tempMeter.className = 'rc-meter';
				setBadge(tempBadge, _('Not provided'), '');
			}

			govKpi.textContent = GOV_SHORT[gov] || (gov || _('Not provided'));
			if (isDyn)
				setBadge(govBadge, _('Dynamic Scaling'), 'good');
			else if (gov === 'performance')
				setBadge(govBadge, _('Max Frequency'), 'good');
			else if (gov === 'powersave')
				setBadge(govBadge, _('Power Saving'), 'warn');
			else if (gov === 'userspace')
				setBadge(govBadge, _('Manual Fixed'), '');
			else
				setBadge(govBadge, _('Unknown'), '');
			var vsfcPart = '';
			if (next && next.vsfc && next.vsfc.available) {
				vsfcPart = next.vsfc.trig_cnt != null
					? (next.vsfc.enabled
						? _('Hardware VSFC idle scaling: On (triggered %s times)').format(next.vsfc.trig_cnt)
						: _('Hardware VSFC idle scaling: Off (triggered %s times)').format(next.vsfc.trig_cnt))
					: (next.vsfc.enabled
						? _('Hardware VSFC idle scaling: On')
						: _('Hardware VSFC idle scaling: Off'));
			}
			var vsfcText = vsfcPart ? (' · ' + vsfcPart) : '';
			govNote.textContent = _('%d OPP steps supported (%s ~ %s) · %d governors available%s.').format(availKhz.length, frequency(Number(minOpp)), frequency(maxOppKhz), availGovs.length, vsfcText);

			var cfgFreq = uci.get('system', 'cpu', 'frequency');
			var defaultGov = (!cfgFreq && availGovs.indexOf('schedutil') >= 0) ? 'schedutil' : 'userspace';
			var cfgGov = uci.get('system', 'cpu', 'governor') || defaultGov;
			var cfgMin = uci.get('system', 'cpu', 'min_freq');
			var cfgMax = uci.get('system', 'cpu', 'max_freq');
			var expectMin = cfgMin ? Number(cfgMin) : Number(minOpp);
			var expectMax = cfgMax ? Number(cfgMax) : maxOppKhz;

			if (nc.current_khz == null) {
				setBadge(stateBadge, _('Not Ready'), 'warn');
				stateKpi.textContent = _('Scaling driver not ready');
				stateNote.textContent = _('Unable to read live frequency from /sys/devices/system/cpu/cpufreq/policy0.');
			} else if (nc.transition_error != null && nc.transition_error !== 0) {
				setBadge(stateBadge, _('Scaling Error'), 'danger');
				stateKpi.textContent = _('Error code %s').format(nc.transition_error);
				stateNote.textContent = _('Clock controller reported a frequency transition failure; check the system log.');
				heroCard.setAttribute('data-tone', 'danger');
			} else if (gov !== cfgGov) {
				setBadge(stateBadge, _('Pending Apply'), 'warn');
				stateKpi.textContent = _('Differs from saved config');
				stateNote.textContent = _('Saved governor is %s, active is %s; click "Save & Apply" below to apply.').format(cfgGov, gov);
			} else if (cfgGov === 'userspace') {
				if (!cfgFreq) {
					setBadge(stateBadge, _('Unconfigured'), 'warn');
					stateKpi.textContent = _('No target frequency set');
					stateNote.textContent = _('Select a target fixed frequency below and click "Save & Apply".');
				} else if (Number(cfgFreq) !== Number(nc.current_khz) ||
					(nc.setspeed_khz != null && Number(nc.setspeed_khz) !== Number(nc.current_khz))) {
					setBadge(stateBadge, _('Mismatch'), 'warn');
					stateKpi.textContent = _('Target differs from actual');
					stateNote.textContent = _('Target %s, actual %s; please re-apply or check logs.').format(frequency(Number(cfgFreq)), frequency(nc.current_khz));
				} else {
					setBadge(stateBadge, _('Applied'), 'good');
					stateKpi.textContent = _('Fixed frequency active');
					stateNote.textContent = _('Actual frequency matches the saved target (%s).').format(frequency(nc.current_khz));
				}
			} else if (DYNAMIC_GOVS.indexOf(cfgGov) >= 0 &&
				((nc.min_khz != null && Number(nc.min_khz) !== expectMin) ||
				 (nc.max_khz != null && Number(nc.max_khz) !== expectMax))) {
				setBadge(stateBadge, _('Range Pending'), 'warn');
				stateKpi.textContent = _('Limits differ from config');
				stateNote.textContent = _('Configured range %s ~ %s; click "Save & Apply" to sync.').format(frequency(expectMin), frequency(expectMax));
			} else {
				setBadge(stateBadge, _('Applied'), 'good');
				stateKpi.textContent = isDyn ? _('Dynamic governor active') : _('Governor active');
				stateNote.textContent = _('Live governor matches configuration; the kernel manages CPU clock frequency automatically.');
			}
		}

		function refresh() {
			if (pending)
				return pending;
			pending = callStatus().then(function(next) {
				update(next);
			}).catch(function(err) {
				alertEl.hidden = false;
				alertEl.textContent = _('Failed to read live status: %s').format(err && err.message ? err.message : String(err));
				updatedEl.textContent = _('Read failed');
			}).then(function() {
				pending = null;
			});
			return pending;
		}

		var toggleBtn = E('button', {
			type: 'button',
			class: 'btn cbi-button',
			click: function() {
				paused = !paused;
				toggleBtn.textContent = paused ? _('Resume Refresh') : _('Pause Refresh');
				if (paused)
					poll.stop();
				else {
					poll.start();
					refresh();
				}
			}
		}, [_('Pause Refresh')]);

		var refreshBtn = E('button', {
			type: 'button',
			class: 'btn cbi-button',
			click: function() {
				refresh();
			}
		}, [_('Refresh Now')]);

		update(state);
		poll.add(refresh, 2);
		document.addEventListener('uci-applied', function() {
			uci.unload('system');
			uci.load('system').then(refresh).catch(refresh);
		});

		var m = new form.Map('system', null, null);
		m.readonly = !L.hasViewPermission();
		var s = m.section(form.NamedSection, 'cpu', 'cpu', _('CPU Scaling Settings'));
		s.anonymous = true;
		s.addremove = false;

		var o = s.option(form.ListValue, 'governor', _('Governor'));
		o.default = availGovs.indexOf('schedutil') >= 0 ? 'schedutil' : 'userspace';
		o.rmempty = false;
		var preferredOrder = ['schedutil', 'performance', 'ondemand', 'conservative', 'powersave', 'userspace'];
		preferredOrder.forEach(function(g) {
			if (availGovs.indexOf(g) >= 0)
				o.value(g, GOV_LABELS[g] || g);
		});
		availGovs.forEach(function(g) {
			if (preferredOrder.indexOf(g) < 0)
				o.value(g, g);
		});

		o = s.option(form.ListValue, 'frequency', _('Target Fixed Frequency'));
		o.depends('governor', 'userspace');
		o.rmempty = false;
		availKhz.forEach(function(khz) { o.value(String(khz), frequency(khz)); });

		o = s.option(form.ListValue, 'min_freq', _('Minimum Frequency'));
		o.depends('governor', 'schedutil');
		o.depends('governor', 'ondemand');
		o.depends('governor', 'conservative');
		o.default = minOpp;
		availKhz.forEach(function(khz) { o.value(String(khz), frequency(khz)); });

		o = s.option(form.ListValue, 'max_freq', _('Maximum Frequency'));
		o.depends('governor', 'schedutil');
		o.depends('governor', 'ondemand');
		o.depends('governor', 'conservative');
		o.default = maxOpp;
		availKhz.forEach(function(khz) { o.value(String(khz), frequency(khz)); });
		o.validate = function(section_id, value) {
			var minVal = Number(this.section.formvalue(section_id, 'min_freq'));
			if (minVal > 0 && Number(value) > 0 && Number(value) < minVal)
				return _('Maximum frequency cannot be lower than minimum frequency');
			return true;
		};

		if (!availKhz.length) {
			m.readonly = true;
			this.handleSaveApply = this.handleSave = this.handleReset = null;
		}

		var guideCard = makeCard(_('What Is This? (CPU Governor & Selection Guide)'),
			E('span', { class: 'rc-badge' }, [_('Guide')]),
			[E('ul', { class: 'rc-note', style: 'margin:0;padding-left:18px;line-height:1.8' }, [
				E('li', {}, [_('"Dynamic (schedutil, recommended)" lets the kernel scheduler scale frequency by live load, dropping to 400 MHz when idle to stay cool and ramping to 1200 MHz under full load.')]),
				E('li', {}, [_('"Performance (performance)" locks all cores at 1200 MHz; "Fixed Frequency (userspace)" lets you lock a specific hardware OPP.')]),
				E('li', {}, [_('All four Cortex-A55 cores share a single clock domain; the live frequency bar and OPP strip below update every 2 seconds.')])
			])]);

		return m.render().then(function(formNode) {
			return E('div', { class: 'rtlcpu' }, [
				E('div', { class: 'rc-header' }, [
					E('div', {}, [
						E('p', { class: 'rc-eyebrow' }, [_('PROCESSOR FREQUENCY & THERMAL · QUAD-CORE CORTEX-A55 SHARED CLOCK')]),
						E('h2', {}, [_('CPU Frequency & Dynamic Scaling')]),
						E('p', { class: 'rc-note' }, [_('Monitor live CPU frequency, temperature, and hardware OPP steps; adjust settings below and click "Save & Apply" to take effect immediately.')])
					]),
					E('div', { class: 'rc-controls' }, [updatedEl, toggleBtn, refreshBtn])
				]),
				alertEl,
				guideCard,
				heroCard,
				E('div', { class: 'rc-grid' }, [tempCard, govCard, stateCard]),
				E('div', { class: 'rc-form' }, [formNode])
			]);
		});
	}
});
