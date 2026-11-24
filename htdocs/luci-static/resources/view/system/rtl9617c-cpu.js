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
	schedutil: '动态调频 (schedutil，推荐：空闲降温、满载自动 1200 MHz)',
	performance: '性能模式 (performance，锁定最高频 1200 MHz)',
	ondemand: '按需调频 (ondemand，按负载自动升降频)',
	conservative: '保守调频 (conservative，平缓升降频)',
	powersave: '省电模式 (powersave，锁定最低频)',
	userspace: '固定频率 (userspace，手动锁定目标频率)'
};

var GOV_SHORT = {
	schedutil: '动态调频 (schedutil)',
	performance: '性能模式 (performance)',
	ondemand: '按需调频 (ondemand)',
	conservative: '保守调频 (conservative)',
	powersave: '省电模式 (powersave)',
	userspace: '固定频率 (userspace)'
};

var DYNAMIC_GOVS = ['schedutil', 'ondemand', 'conservative'];

var CPU_CSS = [
	'.rtlcpu{--rc-accent:var(--primary,#5e72e4);--rc-good:var(--success,#2dce89);--rc-warn:var(--warning,#fb6340);--rc-danger:var(--danger,#f5365c);--rc-border:var(--border-color,#dee2e6);--rc-muted:var(--muted-text,#626f80);--rc-surface:var(--surface-color,#fff);--rc-inset:var(--surface-muted,#f6f9fc);--rc-text:var(--text-strong,#32325d);color:var(--rc-text);font-family:inherit;min-width:0}',
	'.rtlcpu *,.rtlcpu *::before,.rtlcpu *::after{box-sizing:border-box}',
	'@media (prefers-color-scheme:dark){:root:not([data-argon-mode="light"]) .rtlcpu{--rc-border:var(--border-color,#3c3c3c);--rc-muted:var(--muted-text,#adb5bd);--rc-surface:var(--surface-color,#252526);--rc-inset:var(--surface-muted,#2d2d2d);--rc-text:var(--text-strong,#e6e6e6)}}',
	':root[data-argon-mode="dark"] .rtlcpu{--rc-border:var(--border-color,#3c3c3c);--rc-muted:var(--muted-text,#adb5bd);--rc-surface:var(--surface-color,#252526);--rc-inset:var(--surface-muted,#2d2d2d);--rc-text:var(--text-strong,#e6e6e6)}',
	'.rtlcpu .rc-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;margin:6px 0 18px}',
	'.rtlcpu .rc-header h2{margin:0 0 6px;padding:0;border:0;font-size:24px;font-weight:600;background:none;box-shadow:none;width:auto}',
	'.rtlcpu .rc-eyebrow{color:var(--rc-accent);font-size:11px;font-weight:600;letter-spacing:.12em;margin:0 0 4px}',
	'.rtlcpu .rc-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px}',
	'.rtlcpu .rc-updated{font-size:12px;color:var(--rc-muted);font-variant-numeric:tabular-nums}',
	'.rtlcpu .rc-card{min-width:0;padding:18px 20px;border:1px solid var(--rc-border);border-radius:12px;background:var(--rc-surface);box-shadow:0 3px 12px rgba(20,32,60,.035);margin-bottom:18px}',
	'.rtlcpu .rc-hero{border-top:3px solid var(--rc-accent)}',
	'.rtlcpu .rc-hero[data-tone="good"]{border-top-color:var(--rc-good)}',
	'.rtlcpu .rc-hero[data-tone="warn"]{border-top-color:var(--rc-warn)}',
	'.rtlcpu .rc-hero[data-tone="danger"]{border-top-color:var(--rc-danger)}',
	'.rtlcpu .rc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;margin:0 0 18px}',
	'.rtlcpu .rc-grid .rc-card{margin-bottom:0;display:flex;flex-direction:column}',
	'.rtlcpu .rc-card-head{display:flex;flex-wrap:nowrap;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}',
	'.rtlcpu .rc-card-head h3{margin:0;padding:0;border:0;font-size:15px;font-weight:600;background:none;box-shadow:none;width:auto;flex:1 1 auto;min-width:0;line-height:1.4;color:var(--rc-text)}',
	'.rtlcpu .rc-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:6px;background:var(--rc-inset);color:var(--rc-text);font-size:12px;line-height:1.4;flex-shrink:0;white-space:nowrap}',
	'.rtlcpu .rc-badge::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--rc-muted)}',
	'.rtlcpu .rc-good::before{background:var(--rc-good)}',
	'.rtlcpu .rc-warn::before{background:var(--rc-warn)}',
	'.rtlcpu .rc-danger::before{background:var(--rc-danger)}',
	'.rtlcpu .rc-kpi{font-size:22px;font-weight:600;margin:4px 0 8px;font-variant-numeric:tabular-nums;line-height:1.3}',
	'.rtlcpu .rc-note{color:var(--rc-muted);font-size:12px;line-height:1.65;margin:8px 0 0}',
	'.rtlcpu .rc-freq-row{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:2px 0 12px}',
	'.rtlcpu .rc-freq-main{display:inline-flex;align-items:baseline;gap:8px;font-variant-numeric:tabular-nums}',
	'.rtlcpu .rc-freq-val{font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1.2}',
	'.rtlcpu .rc-freq-cap{font-size:13px;color:var(--rc-muted);font-weight:500}',
	'.rtlcpu .rc-freq-pct{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;padding:3px 10px;border-radius:99px;background:var(--rc-inset);color:var(--rc-accent)}',
	'.rtlcpu .rc-freq-pct.is-cool{color:var(--rc-good)}',
	'.rtlcpu .rc-freq-pct.is-peak{color:var(--rc-warn)}',
	'.rtlcpu .rc-freq-track{width:100%;height:12px;border-radius:99px;background:var(--rc-inset);border:1px solid var(--rc-border);overflow:hidden;margin:4px 0 12px}',
	'.rtlcpu .rc-freq-fill{display:block;height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,var(--rc-accent),#825ee4);transition:width .35s ease,background .35s ease}',
	'.rtlcpu .rc-freq-fill.is-cool{background:linear-gradient(90deg,#2dce89,#2dcecc)}',
	'.rtlcpu .rc-freq-fill.is-peak{background:linear-gradient(90deg,var(--rc-accent),var(--rc-warn))}',
	'.rtlcpu .rc-opp-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:6px;margin:4px 0 6px}',
	'.rtlcpu .rc-opp-pill{text-align:center;padding:4px 6px;border-radius:6px;border:1px solid var(--rc-border);background:var(--rc-inset);font-size:11px;font-variant-numeric:tabular-nums;color:var(--rc-muted);transition:all .25s ease}',
	'.rtlcpu .rc-opp-pill.is-active{border-color:var(--rc-accent);background:var(--rc-accent);color:#fff;font-weight:600;box-shadow:0 2px 6px rgba(94,114,228,.28)}',
	'.rtlcpu .rc-opp-pill.is-out{opacity:.42;border-style:dashed}',
	'.rtlcpu .rc-meter{width:100%;height:7px;border-radius:99px;background:var(--rc-inset);overflow:hidden;margin:8px 0}',
	'.rtlcpu .rc-meter>span{display:block;height:100%;width:0%;border-radius:99px;background:var(--rc-good);transition:width .35s ease,background .35s ease}',
	'.rtlcpu .rc-meter.is-warn>span{background:var(--rc-warn)}',
	'.rtlcpu .rc-meter.is-danger>span{background:var(--rc-danger)}',
	'.rtlcpu .rc-form .cbi-section{border-radius:12px}',
	'@media (max-width:720px){.rtlcpu .rc-header h2{font-size:21px}.rtlcpu .rc-controls{width:100%;justify-content:space-between}.rtlcpu .rc-card{padding:16px}.rtlcpu .rc-freq-val{font-size:24px}}'
].join('\n');

function ensureCss() {
	var id = 'rtl9617c-cpu-css';
	if (document.getElementById(id))
		return;
	document.head.appendChild(E('style', { id: id }, [CPU_CSS]));
}

function frequency(value) {
	return value == null ? '未提供' : (value / 1000) + ' MHz';
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

		var updatedEl = E('span', { class: 'rc-updated' }, ['读取中…']);
		var alertEl = E('p', { class: 'alert-message warning', role: 'status', hidden: true });
		var paused = false;
		var pending = null;

		var heroBadge = E('span', { class: 'rc-badge' }, ['读取中']);
		var freqValEl = E('span', { class: 'rc-freq-val' }, ['—']);
		var freqCapEl = E('span', { class: 'rc-freq-cap' }, ['/ ' + frequency(maxOppKhz)]);
		var freqPctEl = E('span', { class: 'rc-freq-pct' }, ['0%']);
		var freqFillEl = E('span', { class: 'rc-freq-fill' });
		var freqTrackEl = E('div', { class: 'rc-freq-track', title: '读取中…' }, [freqFillEl]);
		var oppPills = availKhz.map(function(khz) {
			return {
				khz: Number(khz),
				el: E('span', { class: 'rc-opp-pill' }, [String(khz / 1000) + ' MHz'])
			};
		});
		var oppStripEl = oppPills.length
			? E('div', { class: 'rc-opp-strip' }, oppPills.map(function(p) { return p.el; }))
			: null;
		var freqNoteEl = E('p', { class: 'rc-note' }, ['四核 Cortex-A55 共享时钟域']);
		var heroCard = makeCard('实时 CPU 频率', heroBadge, [
			E('div', { class: 'rc-freq-row' }, [
				E('div', { class: 'rc-freq-main' }, [freqValEl, freqCapEl]),
				freqPctEl
			]),
			freqTrackEl,
			oppStripEl,
			freqNoteEl
		], 'rc-hero');

		var tempBadge = E('span', { class: 'rc-badge' }, ['读取中']);
		var tempKpi = E('div', { class: 'rc-kpi' }, ['—']);
		var tempFill = E('span');
		var tempMeter = E('div', { class: 'rc-meter' }, [tempFill]);
		var tempNote = E('p', { class: 'rc-note' }, ['片上 cpu-thermal 传感器实时采样，建议日常 < 75 °C。']);
		var tempCard = makeCard('SoC 实时温度', tempBadge, [tempKpi, tempMeter, tempNote]);

		var govBadge = E('span', { class: 'rc-badge' }, ['读取中']);
		var govKpi = E('div', { class: 'rc-kpi' }, ['—']);
		var govNote = E('p', { class: 'rc-note' }, ['']);
		var govCard = makeCard('当前调频策略', govBadge, [govKpi, govNote]);

		var stateBadge = E('span', { class: 'rc-badge' }, ['读取中']);
		var stateKpi = E('div', { class: 'rc-kpi' }, ['—']);
		var stateNote = E('p', { class: 'rc-note' }, ['']);
		var stateCard = makeCard('配置生效状态', stateBadge, [stateKpi, stateNote]);

		function update(next) {
			var nc = (next && next.cpu) || {};
			var gov = nc.governor || '';
			var isDyn = DYNAMIC_GOVS.indexOf(gov) >= 0;
			var now = new Date();
			updatedEl.textContent = '更新于 ' + now.toTimeString().slice(0, 8) + ' · 2 秒刷新';
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
				freqValEl.textContent = '未提供';
				freqPctEl.textContent = '—';
				freqPctEl.className = 'rc-freq-pct';
				freqFillEl.style.width = '0%';
				freqFillEl.className = 'rc-freq-fill';
				freqTrackEl.setAttribute('title', '未提供');
				oppPills.forEach(function(p) { p.el.className = 'rc-opp-pill'; });
			}

			if (gov === 'userspace') {
				setBadge(heroBadge, '固定频率 · userspace', 'good');
				heroCard.setAttribute('data-tone', '');
				freqNoteEl.textContent = '当前手动定频：' + frequency(nc.setspeed_khz != null ? nc.setspeed_khz : nc.current_khz) + ' · 四核 Cortex-A55 共享时钟域。';
			} else if (gov) {
				setBadge(heroBadge, (isDyn ? '动态托管 · ' : '策略托管 · ') + gov, 'good');
				heroCard.setAttribute('data-tone', isDyn ? 'good' : '');
				freqNoteEl.textContent = (nc.min_khz != null && nc.max_khz != null)
					? ('当前生效区间：' + frequency(nc.min_khz) + ' ~ ' + frequency(nc.max_khz) + ' · 四核 Cortex-A55 共享时钟域。')
					: '四核 Cortex-A55 共享时钟域。';
			} else {
				setBadge(heroBadge, '驱动未就绪', 'muted');
				heroCard.setAttribute('data-tone', 'warn');
				freqNoteEl.textContent = '未检测到 cpufreq 策略接口。';
			}

			if (next && next.temperature_mC != null) {
				var tempC = Number(next.temperature_mC) / 1000;
				var tempPct = Math.max(0, Math.min(100, Math.round((tempC / 105) * 100)));
				tempKpi.textContent = tempC.toFixed(1) + ' °C';
				tempFill.style.width = tempPct + '%';
				if (tempC >= 85) {
					setBadge(tempBadge, '高温预警', 'danger');
					tempMeter.className = 'rc-meter is-danger';
				} else if (tempC >= 70) {
					setBadge(tempBadge, '温度偏高', 'warn');
					tempMeter.className = 'rc-meter is-warn';
				} else {
					setBadge(tempBadge, '温度正常', 'good');
					tempMeter.className = 'rc-meter';
				}
				tempMeter.setAttribute('title', tempC.toFixed(1) + ' °C / 105 °C 被动温控阈值');
			} else {
				tempKpi.textContent = '未提供';
				tempFill.style.width = '0%';
				tempMeter.className = 'rc-meter';
				setBadge(tempBadge, '未提供', '');
			}

			govKpi.textContent = GOV_SHORT[gov] || (gov || '未提供');
			if (isDyn)
				setBadge(govBadge, '动态调频', 'good');
			else if (gov === 'performance')
				setBadge(govBadge, '锁定最高频', 'good');
			else if (gov === 'powersave')
				setBadge(govBadge, '节能模式', 'warn');
			else if (gov === 'userspace')
				setBadge(govBadge, '手动定频', '');
			else
				setBadge(govBadge, '未知', '');
			govNote.textContent = '硬件支持 ' + availKhz.length + ' 档 OPP（' + frequency(Number(minOpp)) + ' ~ ' + frequency(maxOppKhz) + '）· 可选 ' + availGovs.length + ' 种策略。';

			var cfgGov = uci.get('system', 'cpu', 'governor') || 'userspace';
			var cfgFreq = uci.get('system', 'cpu', 'frequency');
			var cfgMin = uci.get('system', 'cpu', 'min_freq');
			var cfgMax = uci.get('system', 'cpu', 'max_freq');
			var expectMin = cfgMin ? Number(cfgMin) : Number(minOpp);
			var expectMax = cfgMax ? Number(cfgMax) : maxOppKhz;

			if (nc.current_khz == null) {
				setBadge(stateBadge, '未就绪', 'warn');
				stateKpi.textContent = '调频驱动未就绪';
				stateNote.textContent = '未读取到 /sys/devices/system/cpu/cpufreq/policy0 实时频率。';
			} else if (nc.transition_error != null && nc.transition_error !== 0) {
				setBadge(stateBadge, '调频异常', 'danger');
				stateKpi.textContent = '错误码 ' + nc.transition_error;
				stateNote.textContent = '时钟控制器报告切频失败，请检查系统日志。';
				heroCard.setAttribute('data-tone', 'danger');
			} else if (gov !== cfgGov) {
				setBadge(stateBadge, '待应用', 'warn');
				stateKpi.textContent = '与已保存配置不同';
				stateNote.textContent = '已保存策略为 ' + cfgGov + '，当前运行为 ' + gov + '；点击底部「保存并应用」生效。';
			} else if (cfgGov === 'userspace') {
				if (!cfgFreq) {
					setBadge(stateBadge, '未配置', 'warn');
					stateKpi.textContent = '尚未指定固定频率';
					stateNote.textContent = '请在下方选择目标固定频率并点击「保存并应用」。';
				} else if (Number(cfgFreq) !== Number(nc.current_khz) ||
					(nc.setspeed_khz != null && Number(nc.setspeed_khz) !== Number(nc.current_khz))) {
					setBadge(stateBadge, '不一致', 'warn');
					stateKpi.textContent = '目标与实测不符';
					stateNote.textContent = '目标 ' + frequency(Number(cfgFreq)) + '，当前实测 ' + frequency(nc.current_khz) + '，请重新应用或查看日志。';
				} else {
					setBadge(stateBadge, '已生效', 'good');
					stateKpi.textContent = '固定频率运行中';
					stateNote.textContent = '当前实际频率与已保存目标频率完全一致（' + frequency(nc.current_khz) + '）。';
				}
			} else if (DYNAMIC_GOVS.indexOf(cfgGov) >= 0 &&
				((nc.min_khz != null && Number(nc.min_khz) !== expectMin) ||
				 (nc.max_khz != null && Number(nc.max_khz) !== expectMax))) {
				setBadge(stateBadge, '范围待应用', 'warn');
				stateKpi.textContent = '上下限与配置不同';
				stateNote.textContent = '配置区间 ' + frequency(expectMin) + ' ~ ' + frequency(expectMax) + '，点击「保存并应用」同步。';
			} else {
				setBadge(stateBadge, '已生效', 'good');
				stateKpi.textContent = isDyn ? '动态策略托管中' : '策略已生效';
				stateNote.textContent = '实时策略与配置完全一致，内核自动管理 CPU 时钟频率。';
			}
		}

		function refresh() {
			if (pending)
				return pending;
			pending = callStatus().then(function(next) {
				update(next);
			}).catch(function(err) {
				alertEl.hidden = false;
				alertEl.textContent = '实时状态读取失败：' + (err && err.message ? err.message : String(err));
				updatedEl.textContent = '读取失败';
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
				toggleBtn.textContent = paused ? '恢复刷新' : '暂停刷新';
				if (paused)
					poll.stop();
				else {
					poll.start();
					refresh();
				}
			}
		}, ['暂停刷新']);

		var refreshBtn = E('button', {
			type: 'button',
			class: 'btn cbi-button',
			click: function() {
				refresh();
			}
		}, ['立即刷新']);

		update(state);
		poll.add(refresh, 2);
		document.addEventListener('uci-applied', function() {
			uci.unload('system');
			uci.load('system').then(refresh).catch(refresh);
		});

		var m = new form.Map('system', null, null);
		m.readonly = !L.hasViewPermission();
		var s = m.section(form.NamedSection, 'cpu', 'cpu', 'CPU 调频参数设置');
		s.anonymous = true;
		s.addremove = false;

		var o = s.option(form.ListValue, 'governor', '调频策略');
		o.default = 'userspace';
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

		o = s.option(form.ListValue, 'frequency', '目标固定频率');
		o.depends('governor', 'userspace');
		o.rmempty = false;
		availKhz.forEach(function(khz) { o.value(String(khz), frequency(khz)); });

		o = s.option(form.ListValue, 'min_freq', '最低频率下限');
		o.depends('governor', 'schedutil');
		o.depends('governor', 'ondemand');
		o.depends('governor', 'conservative');
		o.default = minOpp;
		availKhz.forEach(function(khz) { o.value(String(khz), frequency(khz)); });

		o = s.option(form.ListValue, 'max_freq', '最高频率上限');
		o.depends('governor', 'schedutil');
		o.depends('governor', 'ondemand');
		o.depends('governor', 'conservative');
		o.default = maxOpp;
		availKhz.forEach(function(khz) { o.value(String(khz), frequency(khz)); });
		o.validate = function(section_id, value) {
			var minVal = Number(this.section.formvalue(section_id, 'min_freq'));
			if (minVal > 0 && Number(value) > 0 && Number(value) < minVal)
				return '最高频率上限不能低于最低频率下限';
			return true;
		};

		if (!availKhz.length) {
			m.readonly = true;
			this.handleSaveApply = this.handleSave = this.handleReset = null;
		}

		var guideCard = makeCard('这是什么？（CPU 调频策略与选型指南）',
			E('span', { class: 'rc-badge' }, ['配置指南']),
			[E('ul', { class: 'rc-note', style: 'margin:0;padding-left:18px;line-height:1.8' }, [
				E('li', {}, ['「动态调频 (schedutil，推荐)」由内核调度器按实时负载自动升降频，空闲回落至 400 MHz 降温省电，满载瞬时拉升至 1200 MHz。']),
				E('li', {}, ['「性能模式 (performance)」全程锁定 1200 MHz 最高频；「固定频率 (userspace)」可手动指定单个硬件频点。']),
				E('li', {}, ['四颗 Cortex-A55 核心共享同一时钟域，下方实时频率进度条与 OPP 档位每 2 秒自动采样更新。'])
			])]);

		return m.render().then(function(formNode) {
			return E('div', { class: 'rtlcpu' }, [
				E('div', { class: 'rc-header' }, [
					E('div', {}, [
						E('p', { class: 'rc-eyebrow' }, ['处理器频率与热管理 · 四核 CORTEX-A55 共享时钟域']),
						E('h2', {}, ['CPU 频率与动态调频']),
						E('p', { class: 'rc-note' }, ['实时监控片上频率、温度与硬件 OPP 档位；调整下方策略后点击「保存并应用」即时生效。'])
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
