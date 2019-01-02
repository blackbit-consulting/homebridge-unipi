"use strict";

module.exports = class Interval {

	constructor(callback, timeout, maxCount, ...args) {
		this.$callback = callback;
		this.$timeout = timeout;
		this.$args = args;
		this.$handle = null;
		this.$maxCount = maxCount;
		this.$counter = 0;
	}

	start() {
		if (this.$handle) {
			throw new Error("Timer already started! Do not reuse timers.");
		}
		this.$handle = setInterval(() => {
			try {
				this.$counter++;
				this.$callback(...this.$args);
			} finally {
				if (this.$counter === this.$maxCount) {
					this.cancel();
				}
			}
		}, this.$timeout);
		return this;
	}

	cancel() {
		if (this.$handle) {
			clearInterval(this.$handle);
		}
		return this;
	}
};
