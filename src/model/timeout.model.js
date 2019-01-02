"use strict";

const Timer = require("./timer.model");
const Interval = require("./interval.model");

/**
 * The Timeout model allows for human-readable timer definitions
 * @type {module.Timeout}
 */
module.exports = class Timeout {

	constructor({d = 0, h = 0, m = 0, s = 0, ms = 0}) {
		this.$data = {
			d: d || 0,
			h: h || 0,
			m: m || 0,
			s: s || 0,
			ms: ms || 0
		}
	}

	toMilliseconds() {
		return (((this.$data.d * 24 + this.$data.h) * 60 + this.$data.m) * 60 + this.$data.s) * 1000 + this.$data.ms;
	}

	/**
	 *
	 * @param callback {function} The callback function
	 * @param args? Optional extra arguments
	 * @return {number} The timeout id for clearing the timeout
	 */
	toTimer(callback, ...args) {
		return new Timer(callback, this.toMilliseconds(), ...args);
	}

	toInterval(callback, maxCount, ...args) {
		return new Interval(callback, this.toMilliseconds(), maxCount, ...args)
	}

	/**
	 * Parse a string looking like this:
	 *   "4d 3h 0m 1s 0ms".
	 *
	 *   Valid units are d (days) h (hours) m (minutes) s (seconds) ms (milliseconds).
	 *   The order is arbitrary, but no double units are allowed. Overflowing a value is allowed: "25h 61m" for example
	 *
	 * @param value
	 * @return {null}
	 */
	static parseUnits(timeoutValue) {
		if (!timeoutValue) {
			return null;
		}
		const newTimeout = {d: 0, h: 0, m: 0, s: 0, ms: 0};
		const entries = timeoutValue.split(" ");

		entries.forEach((entry) => {
			const matches = entry.match(/([0-9]+)([a-z]{1,2})/);
			if (matches[0]) {
				const value = parseInt(matches[1]);
				const unit = matches[2];
				if (!newTimeout.hasOwnProperty(unit)) {
					throw new Error("Invalid timeout unit " + unit);
				}
				if (newTimeout[unit] !== 0) {
					throw new Error("Duplicate timeout unit " + unit);
				}
				newTimeout[unit] = value;
			}
		});

		return new Timeout(newTimeout);
	}
};
