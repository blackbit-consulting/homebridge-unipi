"use strict";

let Timeout = require("../../src/model/timeout.model");

console.log(new Timeout({d: 1, h: 1, m: 1, s: 1, ms: 1}).toMilliseconds());

console.log(Timeout.parseUnits("1d 1m 1h 1ms 1s").toMilliseconds());

new Timeout({s: 4})
	.toTimer((param) => {
		console.log(param)
	}, "timeout")
	.start();

new Timeout({s: 1})
	.toInterval((param) => {
		console.log(param);
	}, 3, "interval")
	.start();
