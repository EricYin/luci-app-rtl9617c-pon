// SPDX-License-Identifier: GPL-2.0-or-later
'use strict';

import { readfile } from 'fs';

/**
 * Read and trim a sysfs/procfs text file, returning null when absent.
 */
export function read_text(path) {
	let text = readfile(path);
	return text == null ? null : trim(text);
};

/**
 * Read a base-10 integer from a sysfs/procfs file, returning null when invalid.
 */
export function read_int(path) {
	let text = read_text(path);
	return text == null || !match(text, /^-?[0-9]+$/) ? null : +text;
};

/**
 * Parse whitespace-separated key=value tokens into an object.
 */
export function parse_fields(text) {
	if (text == null)
		return null;
	let result = {};
	for (let token in split(trim(text), /\s+/)) {
		let position = index(token, '=');
		if (position > 0)
			result[substr(token, 0, position)] = substr(token, position + 1);
	}
	return result;
};

/**
 * Inspect kernel hardware RNG and entropy pool state without side effects.
 */
export function read_entropy() {
	let hw = '/sys/class/misc/hw_random/';
	let current = read_text(hw + 'rng_current');
	let avail_raw = read_text(hw + 'rng_available');
	let available = [];

	if (avail_raw != null && avail_raw != '') {
		for (let item in split(avail_raw, /\s+/)) {
			if (item != '' && item != 'none')
				push(available, item);
		}
	}

	let active = current != null && current != '' && current != 'none';
	return {
		status: active ? 'active' : 'unavailable',
		active: active,
		current: active ? current : (current == 'none' ? 'none' : null),
		available: available,
		quality: active ? read_int(hw + 'rng_quality') : null,
		entropy_avail: read_int('/proc/sys/kernel/random/entropy_avail'),
		poolsize: read_int('/proc/sys/kernel/random/poolsize')
	};
};
