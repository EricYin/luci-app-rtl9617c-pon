'use strict';
'require view';
'require rtl9617c.status as status';
'require rtl9617c.ui as ui';

return view.extend({
	load: function() { return status.callStatus().catch(function() { return null; }); },
	render: function(initial) {
		return ui.page(_('Diagnostics'), _('Preserves raw error codes, session liveness, and full multi-GEM data for troubleshooting line issues.'), initial, status.callStatus, function(data) {
			data = data || {};
			var download = E('button', { type: 'button', class: 'cbi-button', click: function() {
				var url = URL.createObjectURL(new Blob([ui.diagnostics(data)], { type: 'text/plain;charset=utf-8' }));
				var anchor = E('a', { href: url, download: 'rtl9617c-pon-status.txt' });
				anchor.click();
				setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
			} }, _('Download Snapshot'));
			return E('div', {}, [status.ponCard(data), status.card(_('Diagnostic Tools'), null, [E('div', { class: 'tyf-actions' }, [download,
				ui.link(_('System Log'), 'admin/status/logs'), ui.link(_('Ping / Traceroute / DNS'), 'admin/network/diagnostics')]),
				ui.note(_('The snapshot only contains runtime state read by this page and excludes LOID, passwords, PSK, and factory images; it may still include line and service identifiers.'))]),
				status.card(_('Driver & Protocol State'), null, E('pre', { class: 'tyf-raw' }, [ui.diagnostics(data)]))]);
		});
	},
	handleSaveApply: null, handleSave: null, handleReset: null
});
