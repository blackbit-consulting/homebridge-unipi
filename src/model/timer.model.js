"use strict";

module.exports = class Timer {

	constructor(callback, timeout, ...args) {
		this.$callback = callback;
		this.$timeout = timeout;
		this.$args = args;
		this.$handle = null;
	}

	start() {
		if (this.$handle) {
			throw new Error("Timer already started! Do not reuse timers.");
		}
		this.$handle = setTimeout(() => {
			this.$callback(...this.$args);
		}, this.$timeout);
		return this;
	}

	cancel() {
		if (this.$handle) {
			clearTimeout(this.$handle);
		}
		return this;
	}
};
